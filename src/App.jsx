import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import TripMap from './TripMap.jsx'
import LifetimeOverview from './LifetimeOverview.jsx'
import TripPreview from './TripPreview.jsx'
import TripOverview from './TripOverview.jsx'
import WishlistView from './WishlistView.jsx'
import TripDetailsForm from './TripDetailsForm.jsx'
import DurationInput from './DurationInput.jsx'
import { initialAnnualPlans, initialTrips, initialWishlist } from './plannerData.js'
import { searchForPlaces } from './places.js'
import { auth } from './firebase.js'
import {
  loadPlannerData,
  loadSharedTrip,
  loadSharedTrips,
  savePlannerData,
  saveSharedTrip,
} from './plannerStore.js'
import SharedTripsView from './SharedTripsView.jsx'
import FamilyAccessView from './FamilyAccessView.jsx'
import TripInviteAcceptance from './TripInviteAcceptance.jsx'
import TripShareDialog from './TripShareDialog.jsx'
import { syncFamilyTripAccess } from './tripInvites.js'
import './App.css'
import './Auth.css'

const DayCalendar = lazy(() => import('./DayCalendar.jsx'))
const routeCache = new Map()

function getTimeInMinutes(time) {
  const [clock, period] = time.split(' ')
  const [hour, minute] = clock.split(':').map(Number)
  const hour24 = period
    ? (hour % 12) + (period === 'PM' ? 12 : 0)
    : hour
  return hour24 * 60 + minute
}

function getCalendarDateTime(date, time) {
  const dateTime = new Date(`${date}T00:00:00`)
  dateTime.setMinutes(getTimeInMinutes(time))
  return dateTime
}

function formatClock(date) {
  const hour = date.getHours()
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatInputTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatTimeField(time) {
  const minutes = getTimeInMinutes(time)
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function formatTravelTime(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!hours) return `${minutes} min`
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
}

function formatDistance(meters) {
  const miles = meters / 1609.344
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`
}

function getISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTripDateRange(startDateISO, dayCount) {
  const start = new Date(`${startDateISO}T12:00:00`)
  const end = new Date(start)
  end.setDate(start.getDate() + dayCount - 1)
  const format = (date, includeYear) => new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date)

  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, true)}–${format(end, true)}`
  }
  const year = end.getFullYear()
  const startMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start)
  const endMonth = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(end)
  return startMonth === endMonth
    ? `${startMonth} ${start.getDate()}–${end.getDate()}, ${year}`
    : `${format(start, false)}–${format(end, false)}, ${year}`
}

function formatActivityTime(time) {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(time ?? '')
  if (!match) return time
  let hour = Number(match[1])
  const period = match[3]?.toUpperCase()
  if (period) hour = (hour % 12) + (period === 'PM' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${match[2]}`
}

function importLegacyYosemiteActivities(trips, days) {
  const legacyActivities = [...days]
    .sort((first, second) => {
      const getDayNumber = (day) => Number(/day-(\d+)/i.exec(day.id ?? '')?.[1] ?? day.dayNumber ?? 0)
      return getDayNumber(first) - getDayNumber(second)
    })
    .flatMap((day, index) => (
    (Array.isArray(day.activities) ? day.activities : [])
      .filter((activity) => !activity.wishlistItemId)
      .map((activity) => ({
        ...activity,
        time: formatActivityTime(activity.time),
        dayNumber: index + 1,
      }))
  ))
  if (legacyActivities.length === 0) return trips

  return trips.map((trip) => {
    if (trip.id !== 'yosemite') return trip
    const activities = trip.activities ?? []
    const activityIds = new Set(activities.map((activity) => activity.id))
    const importedActivities = legacyActivities.filter((activity) => !activityIds.has(activity.id))
    return {
      ...trip,
      tripDays: Math.max(
        trip.tripDays ?? trip.days ?? 1,
        ...importedActivities.map((activity) => activity.dayNumber),
      ),
      activities: [
        ...activities,
        ...importedActivities,
      ],
    }
  })
}

function getSharedTripData(trip) {
  return Object.fromEntries(
    Object.entries(trip).filter(([key]) => !['id', 'sharedRole', 'locked'].includes(key)),
  )
}

function canContribute(role) {
  return role === 'editor' || role === 'contributor'
}

function getFamilyAccessSyncError(error) {
  if (['functions/not-found', 'functions/internal', 'functions/unavailable'].includes(error.code)) {
    return 'Family access could not be checked. Verify that the latest Firebase Functions are deployed, then try again.'
  }
  return `Family access could not be checked: ${error.message}`
}

function PlannerApp({ user, initialView = 'lifetime' }) {
  const [currentView, setCurrentView] = useState(initialView)
  const [wishlistFocusItemId, setWishlistFocusItemId] = useState('')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [tripViewMode, setTripViewMode] = useState('days')
  const [selectedTripId, setSelectedTripId] = useState(initialTrips[0]?.id ?? '')
  const [trips, setTrips] = useState(initialTrips)
  const [sharedTrips, setSharedTrips] = useState([])
  const [isLoadingSharedTrips, setIsLoadingSharedTrips] = useState(true)
  const [sharedTripsError, setSharedTripsError] = useState('')
  const [selectedSharedTrip, setSelectedSharedTrip] = useState(null)
  const [sharedTrip, setSharedTrip] = useState(null)
  const [sharedTripLoadState, setSharedTripLoadState] = useState('idle')
  const [sharedTripLoadAttempt, setSharedTripLoadAttempt] = useState(0)
  const [sharedTripError, setSharedTripError] = useState('')
  const [annualPlans, setAnnualPlans] = useState(initialAnnualPlans)
  const [wishlistItems, setWishlistItems] = useState(initialWishlist)
  const [days, setDays] = useState([])
  const [activeDayId, setActiveDayId] = useState('')
  const [isAddingActivity, setIsAddingActivity] = useState(false)
  const [isEditingTripDetails, setIsEditingTripDetails] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false)
  const [isShareInfoOpen, setIsShareInfoOpen] = useState(false)
  const [routeResult, setRouteResult] = useState(null)
  const [routeAttempt, setRouteAttempt] = useState(0)
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false)
  const [placeSearchResults, setPlaceSearchResults] = useState([])
  const [placeSearchMessage, setPlaceSearchMessage] = useState('')
  const [placeSearchError, setPlaceSearchError] = useState('')
  const [plannerLoadState, setPlannerLoadState] = useState('loading')
  const [plannerError, setPlannerError] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const [saveError, setSaveError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const placeSearchRequestId = useRef(0)
  const activityIdCounter = useRef(0)
  const saveQueue = useRef(Promise.resolve())
  const savedPlannerData = useRef(null)
  const savedSharedTrip = useRef('')
  const sharedSaveQueue = useRef(Promise.resolve())
  const [activityDraft, setActivityDraft] = useState({
    time: '',
    title: '',
    place: '',
    type: 'Hike',
    cost: '',
    miles: '',
    durationMinutes: '60',
    locationDetails: '',
  })

  useEffect(() => {
    let active = true

    const sharedTripsRequest = (async () => {
      let familySyncError = null
      if (user.emailVerified) {
        try {
          await syncFamilyTripAccess()
        } catch (error) {
          console.error('Unable to refresh family trip access.', error)
          familySyncError = error
        }
      }
      const memberships = await loadSharedTrips(user.uid)
      return { memberships, familySyncError }
    })()
      .catch((error) => ({ error }))

    Promise.all([loadPlannerData(user.uid), sharedTripsRequest])
      .then(([data, sharedTripsResult]) => {
        if (!active) return
        savedPlannerData.current = data
        setTrips(importLegacyYosemiteActivities(data.trips, data.days))
        if (sharedTripsResult.error) {
          console.error('Unable to load shared trip list.', sharedTripsResult.error)
          setSharedTripsError(sharedTripsResult.error.message)
          setSharedTrips([])
        } else {
          setSharedTrips(sharedTripsResult.memberships)
          setSharedTripsError(
            sharedTripsResult.familySyncError
              ? getFamilyAccessSyncError(sharedTripsResult.familySyncError)
              : '',
          )
        }
        setIsLoadingSharedTrips(false)
        setAnnualPlans(data.annualPlans)
        setWishlistItems(data.wishlistItems)
        setDays(data.days)
        setSelectedTripId(data.trips[0]?.id ?? '')
        setActiveDayId(data.days[0]?.id ?? '')
        setPlannerLoadState('ready')
      })
      .catch((error) => {
        if (!active) return
        setIsLoadingSharedTrips(false)
        console.error('Unable to load planner data from Firestore.', error)
        setPlannerError(error.message)
        setPlannerLoadState('error')
      })

    return () => {
      active = false
    }
  }, [user.uid, user.emailVerified, loadAttempt])

  useEffect(() => {
    let active = true
    if (currentView !== 'shared-trip' || !selectedSharedTrip) return undefined

    loadSharedTrip(selectedSharedTrip.ownerUid, selectedSharedTrip.tripId)
      .then(({ trip, days: sharedDays }) => {
        if (!active) return
        const importedTrip = importLegacyYosemiteActivities([trip], sharedDays)[0]
        const nextTrip = {
          ...importedTrip,
          sharedRole: selectedSharedTrip.role === 'editor' ? 'contributor' : selectedSharedTrip.role,
        }
        savedSharedTrip.current = JSON.stringify(getSharedTripData(nextTrip))
        setSharedTrip(nextTrip)
        setSharedTripLoadState('ready')
      })
      .catch((error) => {
        if (!active) return
        console.error('Unable to load shared trip.', error)
        setSharedTripError(error.message)
        setSharedTripLoadState('error')
      })

    return () => {
      active = false
    }
  }, [currentView, selectedSharedTrip, sharedTripLoadAttempt])

  useEffect(() => {
    if (plannerLoadState !== 'ready') return undefined

    let active = true
    const timeout = setTimeout(() => {
      setSaveState('saving')
      setSaveError('')
      const data = { trips, annualPlans, wishlistItems, days }
      const pendingSave = saveQueue.current
        .catch(() => {})
        .then(async () => {
          if (!savedPlannerData.current) throw new Error('Planner data has not finished loading.')
          await savePlannerData(user.uid, savedPlannerData.current, data)
          savedPlannerData.current = data
        })
      saveQueue.current = pendingSave

      pendingSave
        .then(() => {
          if (active) setSaveState('saved')
        })
        .catch((error) => {
          if (!active) return
          console.error('Unable to save planner data to Firestore.', error)
          setSaveError(error.message)
          setSaveState('error')
        })
    }, 500)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [user.uid, plannerLoadState, trips, annualPlans, wishlistItems, days, saveAttempt])

  useEffect(() => {
    if (sharedTripLoadState !== 'ready'
      || !selectedSharedTrip || !canContribute(selectedSharedTrip.role) || !sharedTrip || sharedTrip.locked) return undefined

    const nextData = getSharedTripData(sharedTrip)
    const serialized = JSON.stringify(nextData)
    if (serialized === savedSharedTrip.current) return undefined

    let active = true
    const timeout = setTimeout(() => {
      setSaveState('saving')
      setSaveError('')
      const pendingSave = sharedSaveQueue.current
        .catch(() => {})
        .then(async () => {
          await saveSharedTrip(selectedSharedTrip.ownerUid, selectedSharedTrip.tripId, sharedTrip)
          savedSharedTrip.current = serialized
        })
      sharedSaveQueue.current = pendingSave

      pendingSave
        .then(() => {
          if (active) setSaveState('saved')
        })
        .catch((error) => {
          if (!active) return
          console.error('Unable to save shared trip.', error)
          setSaveError(error.message)
          setSaveState('error')
        })
    }, 500)

    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [saveAttempt, selectedSharedTrip, sharedTrip, sharedTripLoadState])

  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0]
  const minimumTripDays = Math.max(
    selectedTrip?.activities?.reduce(
      (minimum, activity) => Math.max(minimum, activity.dayNumber),
      1,
    ) ?? 1,
    wishlistItems.reduce((minimum, item) => (
      item.tripId === selectedTripId && item.schedule
        ? Math.max(minimum, item.schedule.dayNumber)
        : minimum
    ), 1),
  )
  const activeDay = days.find((day) => day.id === activeDayId)
  const activeDayIndex = Math.max(0, days.findIndex((day) => day.id === activeDayId))
  const activityStartMinutes = activityDraft.time ? getTimeInMinutes(activityDraft.time) : 6 * 60
  const activityMaxDurationMinutes = Math.max(
    15,
    activityDraft.type === 'Stay'
      ? (days.length - activeDayIndex) * 24 * 60 + 23 * 60 - activityStartMinutes
      : 23 * 60 - activityStartMinutes,
  )
  const routeStops = useMemo(() => activeDay?.activities ?? [], [activeDay])
  const mapPickerCenter = activityDraft.coordinates
    ?? activeDay?.activities.find((activity) => activity.coordinates)?.coordinates
    ?? null
  const routeKey = routeStops
    .map((activity) => activity.coordinates
      ? `${activity.coordinates.lng},${activity.coordinates.lat}`
      : '')
    .join(';')
  const canCalculateRoute = false
  const currentRouteResult = routeResult?.key === routeKey ? routeResult : null
  const route = currentRouteResult?.route ?? routeCache.get(routeKey) ?? null
  const routeError = currentRouteResult?.error ?? ''
  const routeLoading = canCalculateRoute && !route && !routeError
  const totals = useMemo(() => {
    const activities = days.flatMap((day) => day.activities)
    return {
      cost: activities.reduce((sum, activity) => sum + Number(activity.cost || 0), 0),
      miles: activities.reduce((sum, activity) => sum + Number(activity.miles || 0), 0),
      activities: activities.length,
    }
  }, [days])
  const calendarEvents = useMemo(() => {
    if (!activeDay) return []
    return activeDay.activities.map((activity) => {
      const start = getCalendarDateTime(activeDay.dateISO, activity.time)
      const end = new Date(start)
      end.setMinutes(end.getMinutes() + activity.durationMinutes)
      return {
        id: activity.id,
        title: activity.title,
        start,
        end,
        classNames: [`calendar-type-${activity.type.toLowerCase()}`],
        extendedProps: {
          place: activity.place,
          type: activity.type,
        },
      }
    })
  }, [activeDay])
  const tripCalendarEvents = useMemo(() => days.flatMap((day) => day.activities.map((activity) => {
    const start = getCalendarDateTime(day.dateISO, activity.time)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + activity.durationMinutes)
    return {
      id: activity.id,
      title: activity.title,
      start,
      end,
      classNames: [`calendar-type-${activity.type.toLowerCase()}`],
      extendedProps: {
        place: activity.place,
        type: activity.type,
      },
    }
  })), [days])

  function ensureAnnualPlan(year) {
    setAnnualPlans((currentPlans) => currentPlans.some((plan) => plan.year === year)
      ? currentPlans
      : [...currentPlans, { year, travelBudget: 6000, vacationDays: 15 }])
  }

  function changeTripYear(tripId, year) {
    const trip = trips.find((item) => item.id === tripId)
    if (!trip) return
    let updatedTrip = { ...trip, year }
    if (trip.startDateISO) {
      const startDate = new Date(`${trip.startDateISO}T12:00:00`)
      startDate.setFullYear(year)
      const startDateISO = getISODate(startDate)
      updatedTrip = {
        ...updatedTrip,
        startDateISO,
        dates: formatTripDateRange(startDateISO, trip.tripDays ?? trip.days ?? 1),
      }
    }
    updateTripDetails(updatedTrip)
  }

  function updateAnnualPlan(year, field, value) {
    setAnnualPlans((currentPlans) => {
      const currentPlan = currentPlans.find((plan) => plan.year === year)
      if (!currentPlan) return [...currentPlans, { year, travelBudget: 6000, vacationDays: 15, [field]: value }]
      return currentPlans.map((plan) => plan.year === year ? { ...plan, [field]: value } : plan)
    })
  }

  function addTrip(trip) {
    setTrips((currentTrips) => [...currentTrips, trip])
    ensureAnnualPlan(trip.year)
  }

  function updateTripDetails(updatedTrip) {
    setTrips((currentTrips) => currentTrips.map((trip) => trip.id === updatedTrip.id ? updatedTrip : trip))
    ensureAnnualPlan(updatedTrip.year)
  }

  function saveTripActivities(tripId, activitiesToSave) {
    const timestamp = Date.now()
    const savedActivities = activitiesToSave.map((activity, index) => ({
      isNew: !activity.id,
      activity: {
        ...activity,
        id: activity.id ?? `${tripId}-activity-${timestamp}-${index}`,
      },
    }))
    setTrips((currentTrips) => currentTrips.map((trip) => {
      if (trip.id !== tripId) return trip
      let activities = trip.activities ?? []
      savedActivities.forEach(({ activity, isNew }) => {
        activities = isNew
          ? [...activities, activity]
          : activities.map((currentActivity) => currentActivity.id === activity.id ? activity : currentActivity)
      })
      return {
        ...trip,
        activities,
      }
    }))
  }

  function saveTripActivity(tripId, activity) {
    saveTripActivities(tripId, [activity])
  }

  function removeTripActivity(tripId, activityId) {
    setTrips((currentTrips) => currentTrips.map((trip) => (
      trip.id === tripId
        ? { ...trip, activities: (trip.activities ?? []).filter((activity) => activity.id !== activityId) }
        : trip
    )))
  }

  function updateWishlistItem(itemId, changes) {
    setWishlistItems((currentItems) => currentItems.map((item) => item.id === itemId ? { ...item, ...changes } : item))
  }

  function scheduleWishlistItem(itemId, schedule) {
    const item = wishlistItems.find((currentItem) => currentItem.id === itemId)
    if (!item) return

    const scheduledItem = {
      ...item,
      tripId: schedule.tripId,
      schedule: {
        dayNumber: schedule.dayNumber,
        time: schedule.time,
        durationMinutes: schedule.durationMinutes,
      },
      status: item.status === 'Visited' ? 'Visited' : 'Scheduled',
    }

    setWishlistItems((currentItems) => currentItems.map((currentItem) => (
      currentItem.id === itemId ? scheduledItem : currentItem
    )))
  }

  function openTrip(trip) {
    setSelectedTripId(trip.id)
    setCurrentView('trip')
    setIsMobileMenuOpen(false)
  }

  function toggleTripLock(tripId) {
    setTrips((currentTrips) => currentTrips.map((trip) => (
      trip.id === tripId ? { ...trip, locked: !trip.locked } : trip
    )))
  }

  async function openSharedTrip(membership) {
    if (sharedTrip && canContribute(selectedSharedTrip?.role) && !sharedTrip.locked) {
      const currentData = JSON.stringify(getSharedTripData(sharedTrip))
      if (currentData !== savedSharedTrip.current) {
        try {
          await sharedSaveQueue.current.catch(() => {})
          await saveSharedTrip(selectedSharedTrip.ownerUid, selectedSharedTrip.tripId, sharedTrip)
          savedSharedTrip.current = currentData
        } catch (error) {
          console.error('Unable to save shared trip before switching.', error)
          setSaveError(error.message)
          setSaveState('error')
          return
        }
      }
    }
    setSelectedSharedTrip(membership)
    setSharedTrip(null)
    setSharedTripError('')
    setSharedTripLoadState('loading')
    savedSharedTrip.current = ''
    setCurrentView('shared-trip')
    setIsMobileMenuOpen(false)
  }

  function saveSharedTripActivities(tripId, activitiesToSave) {
    const timestamp = Date.now()
    setSharedTrip((currentTrip) => {
      if (!currentTrip || currentTrip.id !== tripId) return currentTrip
      let activities = currentTrip.activities ?? []
      activitiesToSave.forEach((activity, index) => {
        const nextActivity = {
          ...activity,
          id: activity.id ?? `${tripId}-activity-${timestamp}-${index}`,
        }
        activities = activity.id
          ? activities.map((existing) => existing.id === nextActivity.id ? nextActivity : existing)
          : [...activities, nextActivity]
      })
      return { ...currentTrip, activities }
    })
  }

  function removeSharedTripActivity(tripId, activityId) {
    setSharedTrip((currentTrip) => (
      currentTrip?.id === tripId
        ? { ...currentTrip, activities: (currentTrip.activities ?? []).filter((activity) => activity.id !== activityId) }
        : currentTrip
    ))
  }

  function openWishlistItem(itemId) {
    setWishlistFocusItemId(itemId)
    setCurrentView('wishlist')
    setIsMobileMenuOpen(false)
  }

  useEffect(() => {
    if (!canCalculateRoute || routeCache.has(routeKey) || currentRouteResult?.route) {
      return undefined
    }

    const controller = new AbortController()
    async function loadRoute() {
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${routeKey}?overview=full&geometries=geojson&steps=false`,
          { signal: controller.signal },
        )
        if (!response.ok) {
          throw new Error(`Routing service returned ${response.status}`)
        }

        const data = await response.json()
        if (data.code !== 'Ok' || !data.routes?.[0] || data.routes[0].legs.length !== routeStops.length - 1) {
          throw new Error('Routing service could not find a complete route')
        }

        const nextRoute = {
          legs: data.routes[0].legs,
          coordinates: data.routes[0].geometry.coordinates,
        }
        routeCache.set(routeKey, nextRoute)
        setRouteResult({ key: routeKey, route: nextRoute, error: '' })
      } catch (error) {
        if (error.name !== 'AbortError') {
          setRouteResult({
            key: routeKey,
            route: null,
            error: error instanceof Error
              ? `Driving estimates are unavailable: ${error.message}`
              : 'Driving estimates are unavailable. Check your connection and try again.',
          })
        }
      }
    }

    loadRoute()
    return () => controller.abort()
  }, [canCalculateRoute, currentRouteResult?.route, routeAttempt, routeKey, routeStops])

  function updateActivityPlace(value) {
    placeSearchRequestId.current += 1
    setIsSearchingPlaces(false)
    setActivityDraft({
      ...activityDraft,
      place: value,
      coordinates: null,
      locationDetails: '',
    })
    setPlaceSearchResults([])
    setPlaceSearchMessage('')
    setPlaceSearchError('')
  }

  async function searchActivityPlace() {
    const query = activityDraft.place.trim()
    if (!query) return

    const requestId = ++placeSearchRequestId.current
    setIsSearchingPlaces(true)
    setPlaceSearchResults([])
    setPlaceSearchMessage('')
    setPlaceSearchError('')

    try {
      const results = await searchForPlaces(query)
      if (requestId === placeSearchRequestId.current) {
        setPlaceSearchResults(results)
        if (results.length === 0) {
          setPlaceSearchMessage('No matching places found. Try adding a city or region.')
        }
      }
    } catch (error) {
      if (requestId === placeSearchRequestId.current) {
        setPlaceSearchError(error instanceof Error
          ? error.message
          : 'Place search failed. Check your connection and try again.')
      }
    } finally {
      if (requestId === placeSearchRequestId.current) {
        setIsSearchingPlaces(false)
      }
    }
  }

  function chooseActivityPlace(place) {
    placeSearchRequestId.current += 1
    setIsSearchingPlaces(false)
    setActivityDraft({
      ...activityDraft,
      place: place.name,
      coordinates: place.coordinates,
      locationDetails: place.details,
    })
    setPlaceSearchResults([])
    setPlaceSearchError('')
    setPlaceSearchMessage(`Selected ${place.name}${place.details ? `, ${place.details}` : ''}.`)
  }

  function clearPlaceSearch() {
    placeSearchRequestId.current += 1
    setIsSearchingPlaces(false)
    setPlaceSearchResults([])
    setPlaceSearchMessage('')
    setPlaceSearchError('')
  }

  function closeActivityForm() {
    clearPlaceSearch()
    setIsAddingActivity(false)
    setEditingActivityId(null)
  }

  function openActivityForm(time = '', durationMinutes = 60) {
    clearPlaceSearch()
    setEditingActivityId(null)
    setActivityDraft({
      time,
      title: '',
      place: '',
      type: 'Hike',
      cost: '',
      miles: '',
      durationMinutes: String(durationMinutes),
      coordinates: null,
      locationDetails: '',
    })
    setIsAddingActivity(true)
  }

  function editActivity(activityId, dayId = activeDayId) {
    const activity = days.find((day) => day.id === dayId)?.activities.find((item) => item.id === activityId)
    if (!activity) return

    clearPlaceSearch()
    setActiveDayId(dayId)
    setTripViewMode('days')
    setEditingActivityId(activity.id)
    setActivityDraft({
      ...activity,
      time: formatTimeField(activity.time),
      cost: String(activity.cost ?? ''),
      miles: String(activity.miles ?? ''),
      durationMinutes: String(activity.durationMinutes),
      coordinates: activity.coordinates ?? null,
      locationDetails: activity.locationDetails ?? '',
    })
    setIsAddingActivity(true)
  }

  function handleEventClick(info) {
    info.jsEvent.preventDefault()
    editActivity(info.event.id)
  }

  function syncWishlistSchedule(activity, dayNumber) {
    if (!activity.wishlistItemId) return
    setWishlistItems((currentItems) => currentItems.map((item) => item.id === activity.wishlistItemId
      ? {
          ...item,
          name: activity.title,
          location: activity.place,
          coordinates: activity.coordinates ?? null,
          details: activity.locationDetails ?? '',
          status: item.status === 'Visited' ? 'Visited' : 'Scheduled',
          schedule: {
            dayNumber,
            time: formatTimeField(activity.time),
            durationMinutes: activity.durationMinutes,
          },
        }
      : item))
  }

  function updateActivitySchedule(activityId, updates, dayId = activeDayId) {
    const activityDay = days.find((day) => day.id === dayId)
    const activity = activityDay?.activities.find((item) => item.id === activityId)
    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === dayId
          ? {
              ...day,
              activities: day.activities
                .map((activity) => activity.id === activityId ? { ...activity, ...updates } : activity)
                .sort((first, second) => getTimeInMinutes(first.time) - getTimeInMinutes(second.time)),
            }
          : day,
      ),
    )
    if (activity) {
      syncWishlistSchedule({ ...activity, ...updates }, days.findIndex((day) => day.id === dayId) + 1)
    }
  }

  function getTripDayForDate(date) {
    if (!date) return undefined
    const dateISO = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return days.find((day) => day.dateISO === dateISO)
  }

  function isEventWithinSchedule(event) {
    if (!event.start || !event.end) return false
    const day = getTripDayForDate(event.start)
    if (!day) return false
    const earliestStart = getCalendarDateTime(day.dateISO, '6:00 AM')
    const latestEnd = getCalendarDateTime(day.dateISO, '11:00 PM')
    if (event.start < earliestStart || event.start >= latestEnd) return false
    if (event.extendedProps?.type === 'Stay') {
      const lastTripDay = days[days.length - 1]
      if (!lastTripDay) return false
      const latestStayEnd = getCalendarDateTime(lastTripDay.dateISO, '11:00 PM')
      latestStayEnd.setDate(latestStayEnd.getDate() + 1)
      return event.end <= latestStayEnd
    }
    const lastOccupiedMinute = new Date(event.end.getTime() - 1)
    return event.end <= latestEnd
      && getTripDayForDate(lastOccupiedMinute)?.id === day.id
  }

  function canMoveEventWithinSchedule(dropInfo, draggedEvent) {
    if (!dropInfo.start || !draggedEvent.start || !draggedEvent.end) return false
    const end = dropInfo.end ?? new Date(dropInfo.start.getTime() + draggedEvent.end.getTime() - draggedEvent.start.getTime())
    return isEventWithinSchedule({
      start: dropInfo.start,
      end,
      extendedProps: draggedEvent.extendedProps,
    })
  }

  function handleEventDrop({ event, revert }) {
    if (!isEventWithinSchedule(event)) {
      revert()
      return
    }
    updateActivitySchedule(event.id, { time: formatClock(event.start) })
  }

  function handleEventResize({ event, revert }) {
    if (!isEventWithinSchedule(event)) {
      revert()
      return
    }
    updateActivitySchedule(event.id, {
      time: formatClock(event.start),
      durationMinutes: Math.max(15, Math.round((event.end - event.start) / 60000)),
    })
  }

  function handleTripEventDrop({ event, revert }) {
    if (!isEventWithinSchedule(event)) {
      revert()
      return
    }

    const sourceDay = days.find((day) => day.activities.some((activity) => activity.id === event.id))
    const targetDay = getTripDayForDate(event.start)
    const activity = sourceDay?.activities.find((item) => item.id === event.id)
    if (!sourceDay || !targetDay || !activity) {
      revert()
      return
    }

    const updatedActivity = {
      ...activity,
      time: formatClock(event.start),
      durationMinutes: Math.max(15, Math.round((event.end - event.start) / 60000)),
    }
    setDays((currentDays) => currentDays.map((day) => {
      if (day.id === targetDay.id) {
        return {
          ...day,
          activities: [...day.activities.filter((item) => item.id !== event.id), updatedActivity]
            .sort((first, second) => getTimeInMinutes(first.time) - getTimeInMinutes(second.time)),
        }
      }
      if (day.id === sourceDay.id) {
        return { ...day, activities: day.activities.filter((item) => item.id !== event.id) }
      }
      return day
    }))
    setActiveDayId(targetDay.id)
    syncWishlistSchedule(updatedActivity, days.findIndex((day) => day.id === targetDay.id) + 1)
  }

  function handleTripEventResize({ event, revert }) {
    if (!isEventWithinSchedule(event)) {
      revert()
      return
    }
    const day = getTripDayForDate(event.start)
    if (!day) {
      revert()
      return
    }
    updateActivitySchedule(event.id, {
      time: formatClock(event.start),
      durationMinutes: Math.max(15, Math.round((event.end - event.start) / 60000)),
    }, day.id)
  }

  function handleTripEventClick(info) {
    info.jsEvent.preventDefault()
    const day = days.find((item) => item.activities.some((activity) => activity.id === info.event.id))
    if (day) editActivity(info.event.id, day.id)
  }

  function handleTimeSelect(selection) {
    const durationMinutes = Math.max(15, Math.round((selection.end - selection.start) / 60000))
    selection.view.calendar.unselect()
    openActivityForm(formatInputTime(selection.start), durationMinutes)
  }

  function saveActivity(event) {
    event.preventDefault()
    const [hour, minute] = activityDraft.time.split(':').map(Number)
    const displayTime = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
    const nextActivity = {
      ...activityDraft,
      id: editingActivityId ?? `${activeDayId}-activity-${++activityIdCounter.current}`,
      time: displayTime,
      durationMinutes: Number(activityDraft.durationMinutes || 60),
      cost: Number(activityDraft.cost || 0),
      ...(activityDraft.miles ? { miles: Number(activityDraft.miles) } : {}),
    }

    setDays((currentDays) =>
      currentDays.map((day) =>
        day.id === activeDayId
          ? {
              ...day,
              activities: (editingActivityId
                ? day.activities.map((activity) => activity.id === editingActivityId ? nextActivity : activity)
                : [...day.activities, nextActivity]).sort(
                (first, second) => getTimeInMinutes(first.time) - getTimeInMinutes(second.time),
              ),
            }
          : day,
      ),
    )
    if (nextActivity.wishlistItemId) {
      syncWishlistSchedule(nextActivity, days.findIndex((day) => day.id === activeDayId) + 1)
    }
    setActivityDraft({ time: '', title: '', place: '', type: 'Hike', cost: '', miles: '', durationMinutes: '60', coordinates: null, locationDetails: '' })
    closeActivityForm()
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    setSaveState('saving')
    setSaveError('')
    try {
      await Promise.all([
        saveQueue.current.catch(() => {}),
        sharedSaveQueue.current.catch(() => {}),
      ])
      if (sharedTrip && canContribute(selectedSharedTrip?.role) && !sharedTrip.locked) {
        await saveSharedTrip(selectedSharedTrip.ownerUid, selectedSharedTrip.tripId, sharedTrip)
        savedSharedTrip.current = JSON.stringify(getSharedTripData(sharedTrip))
      }
      const data = { trips, annualPlans, wishlistItems, days }
      if (!savedPlannerData.current) throw new Error('Planner data has not finished loading.')
      await savePlannerData(user.uid, savedPlannerData.current, data)
      savedPlannerData.current = data
      setSaveState('saved')
      await signOut(auth)
    } catch (error) {
      console.error('Unable to save planner data or sign out.', error)
      setSaveError(error.message)
      setSaveState('error')
      setIsSigningOut(false)
    }
  }

  if (plannerLoadState === 'loading') {
    return (
      <main className="firebase-gate">
        <section className="firebase-gate-card" aria-live="polite">
          <h1>Loading your trips</h1>
          <p>Connecting to your private planner...</p>
        </section>
      </main>
    )
  }

  if (plannerLoadState === 'error') {
    return (
      <main className="firebase-gate">
        <section className="firebase-gate-card">
          <h1>Couldn’t load your trips</h1>
          <p role="alert">{plannerError}</p>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setPlannerError('')
              setIsLoadingSharedTrips(true)
              setSharedTripsError('')
              setPlannerLoadState('loading')
              setLoadAttempt((attempt) => attempt + 1)
            }}
          >
            Try again
          </button>
        </section>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${isMobileMenuOpen ? ' mobile-menu-open' : ''}`}>
        <a className="brand" href="#" aria-label="Wayfare home">
          <span className="brand-mark">w</span>
          <span>wayfare</span>
        </a>
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-controls="primary-navigation"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
        >
          <span className="mobile-menu-icon" aria-hidden="true"><i /><i /><i /></span>
          <span>{isMobileMenuOpen ? 'Close' : 'Menu'}</span>
        </button>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="main-nav" id="primary-navigation" aria-label="Main navigation">
          <button className={`nav-item${currentView === 'lifetime' ? ' active' : ''}`} type="button" onClick={() => {
            setCurrentView('lifetime')
            setIsMobileMenuOpen(false)
          }}>
            <span>▤</span> Lifetime overview
          </button>
          <button className={`nav-item${currentView === 'wishlist' ? ' active' : ''}`} type="button" onClick={() => {
            setWishlistFocusItemId('')
            setCurrentView('wishlist')
            setIsMobileMenuOpen(false)
          }}>
            <span>✦</span> Wish list
          </button>
          <button className={`nav-item${currentView === 'family' ? ' active' : ''}`} type="button" onClick={() => {
            setCurrentView('family')
            setIsMobileMenuOpen(false)
          }}>
            <span>♧</span> Family access
          </button>
          <button className={`nav-item${currentView === 'shared' || currentView === 'shared-trip' ? ' active' : ''}`} type="button" onClick={() => {
            setCurrentView('shared')
            setIsMobileMenuOpen(false)
          }}>
            <span>♧</span> Shared trips{sharedTrips.length > 0 ? ` · ${sharedTrips.length}` : ''}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-avatar">C</div>
          <div><strong>Craig</strong><span>Personal workspace</span></div>
          <span className="more-icon">···</span>
        </div>
      </aside>

      <main className="main-content" id="itinerary">
        <header className="topbar">
          <div className="breadcrumb">
              {currentView === 'lifetime'
              ? <span>My trips</span>
              : <button className="breadcrumb-link" type="button" onClick={() => {
                  setCurrentView(currentView === 'shared-trip' ? 'shared' : 'lifetime')
                setIsMobileMenuOpen(false)
                }}>{currentView === 'shared' || currentView === 'shared-trip' ? 'Shared trips' : 'My trips'}</button>}
            <span className="crumb-slash" aria-hidden="true">/</span>
              <strong aria-current="page">
                {currentView === 'lifetime'
                  ? 'Lifetime overview'
                  : currentView === 'wishlist'
                    ? 'Wish list'
                    : currentView === 'family'
                      ? 'Family access'
                    : currentView === 'shared'
                      ? 'Shared trips'
                      : currentView === 'shared-trip'
                        ? sharedTrip?.name ?? 'Shared trip'
                        : selectedTrip?.name ?? 'Trip'}
              </strong>
          </div>
          <div className="topbar-actions">
            {saveError
              ? <span className="planner-save-error" role="alert">Save failed: {saveError}</span>
              : <span className="planner-save-status" aria-live="polite">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
              </span>}
            {saveError && (
              <button className="save-button" type="button" onClick={() => setSaveAttempt((attempt) => attempt + 1)}>
                Retry save
              </button>
            )}
            <button
              className="profile-button"
              type="button"
              aria-label={isSigningOut ? 'Signing out' : 'Sign out'}
              title={isSigningOut ? 'Signing out' : 'Sign out'}
              disabled={isSigningOut}
              onClick={handleSignOut}
            >
              {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        {currentView === 'lifetime' && (
          <LifetimeOverview
            trips={trips}
            wishlist={wishlistItems}
            annualPlans={annualPlans}
            onTripYearChange={changeTripYear}
            onUpdatePlan={updateAnnualPlan}
            onOpenTrip={openTrip}
            onAddTrip={addTrip}
          />
        )}

        {currentView === 'wishlist' && (
          <WishlistView
            items={wishlistItems}
            trips={trips}
            onUpdateItem={updateWishlistItem}
            onAddItem={(item) => setWishlistItems((currentItems) => [...currentItems, item])}
            onOpenTrip={openTrip}
            onScheduleItem={scheduleWishlistItem}
            focusItemId={wishlistFocusItemId}
          />
        )}

        {currentView === 'family' && (
          <FamilyAccessView user={user} trips={trips} />
        )}

        {currentView === 'shared' && (
          <SharedTripsView
            trips={sharedTrips}
            isLoading={isLoadingSharedTrips}
            error={sharedTripsError}
            onOpen={openSharedTrip}
            onManageFamily={() => {
              setCurrentView('family')
              setIsMobileMenuOpen(false)
            }}
          />
        )}

        {currentView === 'trip' && selectedTrip && (
          <TripPreview
            key={selectedTrip.id}
            trip={selectedTrip}
            minTripDays={minimumTripDays}
            wishlist={wishlistItems}
            trips={trips}
            onBack={() => setCurrentView('lifetime')}
            onOpenWishlistItem={openWishlistItem}
            onScheduleItem={scheduleWishlistItem}
            onSaveActivity={saveTripActivity}
            onSaveActivities={saveTripActivities}
            onRemoveActivity={removeTripActivity}
            onUpdateItem={updateWishlistItem}
            onUpdateTrip={updateTripDetails}
            canShare
            canManageLock
            locked={selectedTrip.locked}
            onToggleLock={() => toggleTripLock(selectedTrip.id)}
            onShareTrip={() => setIsShareInfoOpen(true)}
          />
        )}

        {currentView === 'shared-trip' && sharedTripLoadState === 'loading' && (
          <div className="page-wrap shared-trip-status"><p>Loading shared trip…</p></div>
        )}
        {currentView === 'shared-trip' && sharedTripLoadState === 'error' && (
          <div className="page-wrap shared-trip-status">
            <h1>Couldn’t load shared trip</h1>
            <p role="alert">{sharedTripError}</p>
            <button className="primary-button" type="button" onClick={() => {
              setSharedTripError('')
              setSharedTripLoadState('loading')
              setSharedTripLoadAttempt((attempt) => attempt + 1)
            }}>Try again</button>
            <button className="text-button" type="button" onClick={() => setCurrentView('shared')}>Back to shared trips</button>
          </div>
        )}
        {currentView === 'shared-trip' && sharedTripLoadState === 'ready' && sharedTrip && (
          <TripPreview
            key={`shared-${selectedSharedTrip.ownerUid}-${selectedSharedTrip.tripId}`}
            trip={sharedTrip}
            minTripDays={Math.max(1, ...(sharedTrip.activities ?? []).map((activity) => activity.dayNumber ?? 1))}
            wishlist={[]}
            trips={[sharedTrip]}
            onBack={() => setCurrentView('shared')}
            onOpenWishlistItem={() => {}}
            onScheduleItem={() => {}}
            onSaveActivity={saveSharedTripActivities}
            onSaveActivities={saveSharedTripActivities}
            onRemoveActivity={removeSharedTripActivity}
            onUpdateItem={() => {}}
            onUpdateTrip={(updatedTrip) => setSharedTrip((currentTrip) => (
              currentTrip ? { ...currentTrip, ...updatedTrip } : currentTrip
            ))}
            canEdit={canContribute(selectedSharedTrip.role) && !sharedTrip.locked}
            locked={sharedTrip.locked}
            showWishlist={false}
            backLabel="Back to shared trips"
          />
        )}

        {currentView === 'trip' && selectedTripId === 'yosemite' && tripViewMode === 'legacy' && (
        <div className="page-wrap">
          <section className="trip-heading">
            <div className="trip-heading-title">
              <div>
                <div className="eyebrow"><span className="eyebrow-icon">✳</span> {(selectedTrip.location || 'DESTINATION NOT SET').toUpperCase()} <span className="eyebrow-divider">·</span> ROAD TRIP</div>
                <h1>{selectedTrip.name}</h1>
              </div>
              <button className="secondary-button" type="button" onClick={() => setIsEditingTripDetails((isEditing) => !isEditing)}>
                {isEditingTripDetails ? 'Close editor' : 'Edit trip details'}
              </button>
            </div>
            <div className="trip-meta">
              <span><span className="meta-icon">▣</span> {selectedTrip.dates || `${days.length} days · dates flexible`}</span>
              <span><span className="meta-icon">♙</span> 2 travelers</span>
            </div>
          </section>

          {isEditingTripDetails && (
            <TripDetailsForm
              trip={selectedTrip}
              minTripDays={minimumTripDays}
              onCancel={() => setIsEditingTripDetails(false)}
              onSave={(updatedTrip) => {
                updateTripDetails(updatedTrip)
                setIsEditingTripDetails(false)
              }}
            />
          )}

          <section className="overview-grid" aria-label="Trip overview">
            <article className="overview-card">
              <div className="card-icon calendar-icon">▣</div>
              <div className="card-copy"><span className="card-label">DURATION</span><strong>{days.length} days</strong><span className="card-detail">{selectedTrip.dates || 'Dates flexible'}</span></div>
            </article>
            <article className="overview-card">
              <div className="card-icon cost-icon">$</div>
              <div className="card-copy"><span className="card-label">ESTIMATED COST</span><strong>${totals.cost.toLocaleString()}</strong><span className="card-detail">For 2 travelers</span></div>
            </article>
            <article className="overview-card">
              <div className="card-icon hike-icon">⌁</div>
              <div className="card-copy"><span className="card-label">HIKING DISTANCE</span><strong>{totals.miles.toFixed(1)} <small>mi</small></strong><span className="card-detail">Across all days</span></div>
            </article>
            <article className="overview-card">
              <div className="card-icon activity-icon">☷</div>
              <div className="card-copy"><span className="card-label">ACTIVITIES</span><strong>{totals.activities}</strong><span className="card-detail">Planned so far</span></div>
            </article>
          </section>

          <div className="trip-view-switcher" role="tablist" aria-label="Trip views">
            <button
              type="button"
              role="tab"
              aria-selected={tripViewMode === 'overview'}
              className={tripViewMode === 'overview' ? 'selected' : ''}
              onClick={() => {
                closeActivityForm()
                setTripViewMode('overview')
              }}
            >
              Whole-trip overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tripViewMode === 'days'}
              className={tripViewMode === 'days' ? 'selected' : ''}
              onClick={() => setTripViewMode('days')}
            >
              Day-by-day
            </button>
          </div>

          {tripViewMode === 'overview' && (
            <TripOverview
              days={days}
              events={tripCalendarEvents}
              eventAllow={canMoveEventWithinSchedule}
              onOpenDay={(dayId) => {
                closeActivityForm()
                setActiveDayId(dayId)
                setTripViewMode('days')
              }}
              onEventDrop={handleTripEventDrop}
              onEventResize={handleTripEventResize}
              onEventClick={handleTripEventClick}
            />
          )}

          {tripViewMode === 'days' && (
          <section className="itinerary-section">
            <div className="section-heading">
              <div>
                <h2>Itinerary</h2>
                <p>Click a block to edit it; drag to reschedule or select time to add</p>
              </div>
            <button className="add-activity-button" type="button" onClick={() => isAddingActivity ? closeActivityForm() : openActivityForm()}>
                <span aria-hidden="true">+</span> Add activity
              </button>
            </div>

            <div className="day-tabs" role="tablist" aria-label="Trip days">
              {days.map((day) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={day.id === activeDayId}
                  className={`day-tab ${day.id === activeDayId ? 'selected' : ''}`}
                  key={day.id}
                  onClick={() => {
                    if (day.id !== activeDayId) closeActivityForm()
                    setActiveDayId(day.id)
                  }}
                >
                  <span>{day.label}</span><small>{day.date}</small>
                </button>
              ))}
            </div>

            <section className="route-section" aria-label="Map and driving estimates">
              <div className="route-section-heading">
                <div><h3>Map &amp; driving time</h3><p>See how your stops fit together</p></div>
                <span className="route-mode">↗ Driving estimates</span>
              </div>
              <div className="route-layout">
                <div className="map-frame">
                  <TripMap
                    activities={activeDay?.activities ?? []}
                    routeCoordinates={route?.coordinates ?? []}
                  />
                </div>
                <div className="route-details">
                  {routeLoading && <p className="route-message">Calculating driving route…</p>}
                  {!routeLoading && routeError && (
                    <div className="route-error">
                      <p>{routeError}</p>
                      <button type="button" onClick={() => {
                        setRouteResult({ key: routeKey, route: null, error: '' })
                        setRouteAttempt((attempt) => attempt + 1)
                      }}>Try again</button>
                    </div>
                  )}
                  {!routeLoading && !routeError && route && route.legs.map((leg, index) => (
                    <article className="route-leg" key={`${activeDayId}-${index}`}>
                      <span className="route-leg-number">{index + 1}</span>
                      <div className="route-leg-copy">
                        <span className="route-leg-stops">{routeStops[index].place} <small>to</small> {routeStops[index + 1].place}</span>
                        <strong>{formatTravelTime(leg.duration)}</strong>
                        <span className="route-leg-distance">{formatDistance(leg.distance)} by road</span>
                      </div>
                    </article>
                  ))}
                  {!routeLoading && !routeError && routeStops.length < 2 && (
                    <p className="route-message">Add at least two activities to see travel estimates.</p>
                  )}
                  {!routeLoading && !routeError && routeStops.length >= 2 && !route && (
                    <p className="route-message">Pin each activity on the map to calculate the complete driving route.</p>
                  )}
                </div>
              </div>
              <p className="route-attribution">Stop coordinates are sent to the public OSRM demo router. Estimates may not reflect traffic, closures, or current road conditions.</p>
            </section>

            {isAddingActivity && (
              <form className="activity-form" onSubmit={saveActivity}>
                <div className="form-heading">
                  <div><strong>{editingActivityId ? 'Edit activity' : 'Add an activity'}</strong><span>For {activeDay?.date}</span></div>
                  <button type="button" className="close-form" aria-label="Close form" onClick={closeActivityForm}>×</button>
                </div>
                <div className="form-grid">
                  <label>Activity name<input required value={activityDraft.title} onChange={(event) => setActivityDraft({ ...activityDraft, title: event.target.value })} placeholder="e.g. Hike to the falls" /></label>
                  <label>Time<input required type="time" min="06:00" max="22:45" value={activityDraft.time} onChange={(event) => setActivityDraft({ ...activityDraft, time: event.target.value })} /></label>
                  <label className="location-search-field">Location
                    <span className="place-search-row">
                      <input value={activityDraft.place} onChange={(event) => updateActivityPlace(event.target.value)} placeholder="Place, address, or landmark" />
                      <button type="button" className="place-search-button" onClick={searchActivityPlace} disabled={!activityDraft.place.trim() || isSearchingPlaces}>
                        {isSearchingPlaces ? 'Searching…' : 'Search'}
                      </button>
                    </span>
                    <small className="place-search-note">Search term sent to Photon.</small>
                  </label>
                  <label>Type<select value={activityDraft.type} onChange={(event) => setActivityDraft({ ...activityDraft, type: event.target.value })}><option>Hike</option><option>Food</option><option>Travel</option><option>Stay</option><option>Scenic</option><option>Activity</option><option>Other</option></select></label>
                  <label>Cost ($)<input type="number" min="0" step="0.01" value={activityDraft.cost} onChange={(event) => setActivityDraft({ ...activityDraft, cost: event.target.value })} placeholder="0" /></label>
                  <label>Distance (mi)<input type="number" min="0" step="0.1" value={activityDraft.miles} onChange={(event) => setActivityDraft({ ...activityDraft, miles: event.target.value })} placeholder="Optional" /></label>
                  <DurationInput
                    value={activityDraft.durationMinutes}
                    maxMinutes={activityMaxDurationMinutes}
                    onChange={(durationMinutes) => setActivityDraft({ ...activityDraft, durationMinutes })}
                  />
                </div>
                {placeSearchError && <p className="place-search-feedback search-error" role="alert">{placeSearchError}</p>}
                {placeSearchMessage && <p className="place-search-feedback" aria-live="polite">{placeSearchMessage}</p>}
                {placeSearchResults.length > 0 && (
                  <div className="place-search-results" aria-label="Place search results">
                    {placeSearchResults.map((place) => (
                      <button className="place-result" type="button" key={place.id} onClick={() => chooseActivityPlace(place)}>
                        <span className="place-result-name">{place.name}</span>
                        {place.details && <span className="place-result-details">{place.details}</span>}
                      </button>
                    ))}
                    <p className="place-search-attribution">Place results by Photon using OpenStreetMap data.</p>
                  </div>
                )}
                <div className="location-picker-control">
                  <button type="button" className="cancel-button" onClick={() => setIsMapPickerOpen(true)}>⌖ {activityDraft.coordinates ? 'Change map pin' : 'Pin location on map'}</button>
                  {activityDraft.coordinates
                    ? <span>Location pinned ({activityDraft.coordinates.lat.toFixed(4)}, {activityDraft.coordinates.lng.toFixed(4)})</span>
                    : <span>Pin this stop to include it in driving estimates.</span>}
                </div>
                <div className="form-actions"><button type="button" className="cancel-button" onClick={closeActivityForm}>Cancel</button><button type="submit" className="save-button">{editingActivityId ? 'Save changes' : 'Add to itinerary'}</button></div>
              </form>
            )}

            {activeDay && (
              <div className="calendar-container" role="tabpanel">
                <div className="calendar-heading">
                  <div><span className="day-date-label">{activeDay.date.toUpperCase()}</span><h3>{activeDay.title}</h3></div>
                  <span className="day-count">{activeDay.activities.length} time blocks</span>
                </div>
                <Suspense fallback={<p className="calendar-loading">Loading day calendar…</p>}>
                  <DayCalendar
                    key={`${activeDay.id}-${activeDay.dateISO}`}
                    dayId={activeDay.id}
                    date={activeDay.dateISO}
                    events={calendarEvents}
                    eventAllow={canMoveEventWithinSchedule}
                    onTimeSelect={handleTimeSelect}
                    onEventDrop={handleEventDrop}
                    onEventResize={handleEventResize}
                    onEventClick={handleEventClick}
                  />
                </Suspense>
              </div>
            )}
          </section>
          )}
          <footer className="page-footer"><span>✳ Made for the journey</span><span>Trip data is currently a local preview</span></footer>
        </div>
        )}
      </main>

      {isShareInfoOpen && selectedTrip && (
        <TripShareDialog
          user={user}
          trip={selectedTrip}
          onClose={() => setIsShareInfoOpen(false)}
        />
      )}

      {isMapPickerOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsMapPickerOpen(false) }}>
          <section className="map-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="map-picker-title">
            <div className="map-picker-heading">
              <div><h2 id="map-picker-title">Pin this activity</h2><p>Click the map to set the exact location for {activityDraft.title || 'this stop'}.</p></div>
              <button className="close-form" type="button" aria-label="Close map picker" onClick={() => setIsMapPickerOpen(false)}>×</button>
            </div>
            <div className="picker-map-frame">
              <TripMap
                activities={[]}
                initialCenter={mapPickerCenter}
                selectedLocation={activityDraft.coordinates}
                onLocationSelect={(coordinates) => {
                  setActivityDraft({ ...activityDraft, coordinates })
                  setIsMapPickerOpen(false)
                }}
              />
            </div>
            <p className="map-picker-hint">Zoom and pan to the place, then click to drop a pin. Map data © OpenStreetMap contributors.</p>
          </section>
        </div>
      )}
    </div>
  )
}

function getInviteFromUrl() {
  const params = new URLSearchParams(window.location.search)
  const invite = {
    ownerUid: params.get('inviteOwner') ?? '',
    tripId: params.get('inviteTrip') ?? '',
    inviteId: params.get('inviteId') ?? '',
    token: params.get('inviteToken') ?? '',
  }
  return Object.values(invite).some(Boolean) ? invite : null
}

function App() {
  const [user, setUser] = useState(null)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState('')
  const [invite, setInvite] = useState(getInviteFromUrl)
  const [openSharedTripsAfterInvite, setOpenSharedTripsAfterInvite] = useState(false)

  useEffect(() => onAuthStateChanged(
    auth,
    (currentUser) => {
      setUser(currentUser)
      setIsCheckingAuth(false)
      setAuthError('')
    },
    (error) => {
      console.error('Unable to check Firebase Authentication state.', error)
      setAuthError(error.message)
      setIsCheckingAuth(false)
    },
  ), [])

  async function handleGoogleSignIn() {
    setIsSigningIn(true)
    setAuthError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
    } catch (error) {
      console.error('Google sign-in failed.', error)
      setAuthError(error.message)
      setIsSigningIn(false)
    }
  }

  const handleInviteAccepted = useCallback(() => {
    setInvite(null)
    setOpenSharedTripsAfterInvite(true)
  }, [])
  const handleContinueToPlanner = useCallback(() => setInvite(null), [])

  if (isCheckingAuth) {
    return (
      <main className="firebase-gate">
        <section className="firebase-gate-card" aria-live="polite">
          <h1>Checking your account</h1>
          <p>Connecting to Firebase Authentication...</p>
        </section>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="firebase-gate">
        <section className="firebase-gate-card">
          <div className="brand">
            <span className="brand-mark">w</span>
            <span>wayfare</span>
          </div>
          <h1>{invite ? 'Sign in to join a shared trip' : 'Your trips, saved privately'}</h1>
          <p>{invite
            ? 'Use the Google account that received this invitation. The owner will only share this trip.'
            : 'Sign in with the Google account you use for your travel planner.'}</p>
          {authError && <p className="firebase-gate-error" role="alert">{authError}</p>}
          <button className="primary-button" type="button" disabled={isSigningIn} onClick={handleGoogleSignIn}>
            {isSigningIn ? 'Opening Google sign-in…' : 'Continue with Google'}
          </button>
        </section>
      </main>
    )
  }

  if (invite) {
    return (
      <TripInviteAcceptance
        user={user}
        invite={invite}
        onAccepted={handleInviteAccepted}
        onContinue={handleContinueToPlanner}
      />
    )
  }

  return <PlannerApp key={user.uid} user={user} initialView={openSharedTripsAfterInvite ? 'shared' : 'lifetime'} />
}

export default App
