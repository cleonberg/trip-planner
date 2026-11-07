import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import ScheduleItemForm from './ScheduleItemForm.jsx'
import TripActivityForm from './TripActivityForm.jsx'
import TripDetailsForm from './TripDetailsForm.jsx'
import TripMap from './TripMap.jsx'
import TripRouteMap from './TripRouteMap.jsx'
import { getDrivingLeg, getDrivingRoute } from './routing.js'
import './TripPreview.css'

const TripCalendar = lazy(() => import('./TripCalendar.jsx'))
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function getTripCalendarDays(trip) {
  const dayCount = Math.max(1, trip.tripDays ?? trip.days ?? 1)
  const year = Number.isInteger(trip.year) ? trip.year : new Date().getFullYear()
  const startDate = trip.startDateISO
    ? new Date(`${trip.startDateISO}T00:00:00`)
    : new Date(year, 0, 1)

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    const dateISO = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return {
      id: `${trip.id}-day-${index + 1}`,
      label: `Day ${index + 1}`,
      dateISO,
    }
  })
}

function formatInputTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDateISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getTravelCoordinates(item, isArrival) {
  if (item.type === 'Flight') {
    return isArrival ? item.destinationCoordinates : item.originCoordinates
  }
  return item.coordinates
}

function isCoordinates(value) {
  return value
    && Number.isFinite(value.lat)
    && Number.isFinite(value.lng)
    && value.lat >= -90
    && value.lat <= 90
    && value.lng >= -180
    && value.lng <= 180
}

function getDistanceMeters(first, second) {
  const radians = (degrees) => degrees * (Math.PI / 180)
  const latitudeDifference = radians(second.lat - first.lat)
  const longitudeDifference = radians(second.lng - first.lng)
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat))
    * Math.sin(longitudeDifference / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}

function formatTravelDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (!hours) return `${minutes} min`
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
}

function getTravelPlacement(connection, placement) {
  return placement ?? connection.defaultPlacement
}

function TripPreview({
  trip,
  minTripDays,
  wishlist,
  trips,
  onBack,
  onOpenWishlistItem,
  onScheduleItem,
  onSaveActivity,
  onSaveActivities,
  onRemoveActivity,
  onUpdateItem,
  onUpdateTrip,
  onShareTrip,
  onToggleLock,
  canEdit = true,
  canShare = false,
  canManageLock = false,
  locked = false,
  showWishlist = true,
  backLabel = 'Back to lifetime overview',
}) {
  const [schedulingItemId, setSchedulingItemId] = useState(null)
  const [scheduleView, setScheduleView] = useState('calendar')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isAddingIdea, setIsAddingIdea] = useState(false)
  const [isWishListPanelOpen, setIsWishListPanelOpen] = useState(false)
  const [isAddingActivity, setIsAddingActivity] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [mapView, setMapView] = useState('overview')
  const [travelTimeEvents, setTravelTimeEvents] = useState([])
  const [travelTimeError, setTravelTimeError] = useState('')
  const [travelTimeWarning, setTravelTimeWarning] = useState('')
  const [isEstimatingTravelTimes, setIsEstimatingTravelTimes] = useState(false)
  const [overviewRouteResult, setOverviewRouteResult] = useState(null)
  const [travelEstimateAttempt, setTravelEstimateAttempt] = useState(0)
  const [activeTravelConnectionId, setActiveTravelConnectionId] = useState(null)
  const tripExperiences = useMemo(
    () => wishlist.filter((item) => item.tripId === trip.id),
    [trip.id, wishlist],
  )
  const tripActivities = useMemo(() => trip.activities ?? [], [trip.activities])
  const tripLocations = Array.isArray(trip.stops)
    ? trip.stops.map((stop) => stop.name?.trim()).filter(Boolean)
    : []
  const displayedTripLocations = tripLocations.length ? tripLocations : [trip.location].filter(Boolean)
  const assignedItemsCost = useMemo(
    () => [
      ...tripExperiences.map((item) => item.estimatedCost),
      ...tripActivities.map((activity) => activity.cost),
    ].reduce((total, cost) => {
      const amount = Number(cost)
      return total + (Number.isFinite(amount) ? amount : 0)
    }, 0),
    [tripActivities, tripExperiences],
  )
  const tripMapMarkers = useMemo(() => {
    const tripStatus = trip.status?.toLowerCase() === 'visited' ? 'visited' : 'planned'
    const keyPlaceMarkers = (Array.isArray(trip.stops) ? trip.stops : [])
      .filter((stop) => stop.coordinates)
      .map((stop, index) => ({
        id: `key-place-${stop.id ?? index}`,
        title: stop.name,
        place: stop.name,
        time: 'Key place',
        mapStatus: tripStatus,
        locationDetails: stop.details,
        coordinates: stop.coordinates,
      }))
    const destinationMarkers = keyPlaceMarkers.length || !trip.coordinates
      ? keyPlaceMarkers
      : [{
          id: 'trip-destination',
          title: trip.name,
          place: trip.location,
          time: 'Trip destination',
          mapStatus: tripStatus,
          coordinates: trip.coordinates,
        }]
    const activityMarkers = tripActivities.flatMap((activity, index) => {
      const time = [
        activity.dayNumber ? `Day ${activity.dayNumber}` : '',
        activity.time,
      ].filter(Boolean).join(' · ')
      const createMarker = (suffix, place, locationDetails, coordinates) => coordinates && ({
        id: `activity-${activity.id ?? index}-${suffix}`,
        title: activity.title,
        place,
        time,
        mapStatus: tripStatus,
        mapRadius: 7,
        locationDetails,
        coordinates,
      })

      if (activity.type === 'Flight') {
        return [
          createMarker('origin', activity.origin, activity.originDetails, activity.originCoordinates),
          createMarker('destination', activity.destination, activity.destinationDetails, activity.destinationCoordinates),
        ].filter(Boolean)
      }

      return [createMarker('stop', activity.place, activity.locationDetails, activity.coordinates)].filter(Boolean)
    })
    const ideaMarkers = tripExperiences
      .filter((item) => item.coordinates)
      .map((item) => ({
        id: `idea-${item.id}`,
        title: item.name,
        place: item.location,
        time: item.schedule
          ? `Day ${item.schedule.dayNumber} · ${item.schedule.time}`
          : 'Assigned idea',
        mapStatus: item.status?.toLowerCase() === 'visited' ? 'visited' : tripStatus,
        mapRadius: 7,
        locationDetails: item.details ?? item.locationDetails,
        coordinates: item.coordinates,
      }))

    return [...destinationMarkers, ...activityMarkers, ...ideaMarkers]
  }, [trip, tripActivities, tripExperiences])
  const scheduledItems = useMemo(
    () => tripExperiences
      .filter((item) => item.schedule)
      .sort((first, second) => first.schedule.dayNumber - second.schedule.dayNumber
        || first.schedule.time.localeCompare(second.schedule.time)),
    [tripExperiences],
  )
  const calendarDays = useMemo(
    () => getTripCalendarDays(trip),
    [trip],
  )
  const scheduledEntries = useMemo(() => [
    ...scheduledItems.map((item) => ({
      id: item.id,
      title: item.name,
      place: item.location,
      coordinates: item.coordinates,
      cost: item.estimatedCost,
      dayNumber: item.schedule.dayNumber,
      time: item.schedule.time,
      durationMinutes: item.schedule.durationMinutes,
      type: 'Wish-list idea',
      kind: 'idea',
    })),
    ...tripActivities.map((activity) => ({ ...activity, kind: 'activity' })),
  ].sort((first, second) => first.dayNumber - second.dayNumber || first.time.localeCompare(second.time)), [
    scheduledItems,
    tripActivities,
  ])
  const travelConnections = useMemo(() => {
    const entriesByDay = new Map()
    scheduledEntries.forEach((entry) => {
      const entries = entriesByDay.get(entry.dayNumber) ?? []
      entries.push(entry)
      entriesByDay.set(entry.dayNumber, entries)
    })

    function getEntryDateTime(dayNumber, entry) {
      const day = calendarDays[dayNumber - 1]
      if (!day) return null
      const [hour, minute] = entry.time.split(':').map(Number)
      const date = new Date(`${day.dateISO}T00:00:00`)
      date.setHours(hour, minute)
      return date
    }

    const stayIntervals = scheduledEntries
      .filter((entry) => entry.type === 'Stay')
      .flatMap((entry) => {
        const start = getEntryDateTime(entry.dayNumber, entry)
        if (!start) return []
        const end = new Date(start)
        end.setMinutes(end.getMinutes() + Number(entry.durationMinutes || 0))
        return [{ entry, start, end }]
      })
    const connections = []

    for (const [dayNumber, entries] of entriesByDay) {
      for (let index = 0; index < entries.length - 1; index += 1) {
        const previous = entries[index]
        const next = entries[index + 1]
        if (previous.type === 'Stay') continue
        connections.push({
          id: `travel-${dayNumber}-${previous.id}-${next.id}`,
          dayNumber,
          from: previous,
          to: next,
          defaultPlacement: 'after-previous',
        })
      }

      const firstActivity = entries.find((entry) => entry.type !== 'Stay')
      if (!firstActivity) continue
      const firstActivityStart = getEntryDateTime(dayNumber, firstActivity)
      if (!firstActivityStart) continue
      const day = calendarDays[dayNumber - 1]
      if (!day) continue
      const dayStart = new Date(`${day.dateISO}T00:00:00`)
      const stay = stayIntervals
        .filter((interval) => interval.start < firstActivityStart && interval.end > dayStart)
        .sort((first, second) => second.start - first.start)[0]
      if (!stay) continue

      connections.push({
        id: `travel-stay-${dayNumber}-${stay.entry.id}-${firstActivity.id}`,
        dayNumber,
        from: stay.entry,
        to: firstActivity,
        defaultPlacement: 'before-next',
      })
    }

    return connections
  }, [calendarDays, scheduledEntries])
  const overviewRouteKey = JSON.stringify(travelConnections.map((connection) => [
    connection.id,
    trip.travelSettings?.[connection.id]?.mode ?? 'driving',
    getTravelCoordinates(connection.from, true),
    getTravelCoordinates(connection.to, false),
  ]))
  const hasCurrentOverviewRoutes = overviewRouteResult?.key === overviewRouteKey
  const overviewRouteSegments = hasCurrentOverviewRoutes ? overviewRouteResult.segments : []
  const overviewRouteError = hasCurrentOverviewRoutes ? overviewRouteResult.error : ''
  const isLoadingOverviewRoutes = !hasCurrentOverviewRoutes
  const overviewDrivingTime = !hasCurrentOverviewRoutes
    ? 'Calculating…'
    : overviewRouteError
      ? 'Unavailable'
      : overviewRouteResult.routeCount
        ? formatTravelDuration(Math.ceil(overviewRouteResult.durationSeconds / 60))
        : '—'
  const overviewDrivingDistance = !hasCurrentOverviewRoutes
    ? 'Calculating…'
    : overviewRouteError
      ? 'Unavailable'
      : overviewRouteResult.routeCount
        ? `${(overviewRouteResult.distanceMeters / 1609.344).toFixed(1)} mi`
        : '—'
  const calendarEvents = useMemo(() => scheduledEntries.flatMap((item) => {
    const day = calendarDays[item.dayNumber - 1]
    if (!day) return []
    const [hour, minute] = item.time.split(':').map(Number)
    const start = new Date(`${day.dateISO}T00:00:00`)
    start.setHours(hour, minute)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + item.durationMinutes)
    return [{
      id: item.id,
      title: item.title,
      start,
      end,
      classNames: [`calendar-type-${item.kind === 'idea' ? 'other' : item.type.toLowerCase()}`],
      extendedProps: { place: item.place, type: item.type, kind: item.kind },
    }]
  }), [calendarDays, scheduledEntries])
  const allCalendarEvents = useMemo(
    () => [...calendarEvents, ...travelTimeEvents],
    [calendarEvents, travelTimeEvents],
  )

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function estimateTravelTimes() {
      setTravelTimeError('')
      setTravelTimeWarning('')
      setIsEstimatingTravelTimes(true)
      const travelEvents = []
      let blockedRoutes = 0
      function getEntryDateTime(dayNumber, entry) {
        const day = calendarDays[dayNumber - 1]
        if (!day) return null
        const [hour, minute] = entry.time.split(':').map(Number)
        const date = new Date(`${day.dateISO}T00:00:00`)
        date.setHours(hour, minute)
        return date
      }

      const scheduledIntervals = scheduledEntries.flatMap((entry) => {
        const start = getEntryDateTime(entry.dayNumber, entry)
        if (!start) return []
        return [{
          start,
          end: new Date(start.getTime() + Number(entry.durationMinutes || 0) * 60_000),
        }]
      })

      const routeEstimates = await Promise.all(travelConnections.map(async (connection) => {
        const settings = trip.travelSettings?.[connection.id] ?? {}
        const mode = settings.mode ?? 'driving'
        const requestedManualDuration = Number(settings.durationMinutes)
        const hasManualDuration = settings.durationMinutes !== ''
          && Number.isFinite(requestedManualDuration)
          && requestedManualDuration > 0
        if (mode !== 'driving' || hasManualDuration) return null

        const from = getTravelCoordinates(connection.from, true)
        const to = getTravelCoordinates(connection.to, false)
        if (!isCoordinates(from) || !isCoordinates(to) || getDistanceMeters(from, to) <= 100) return null

        try {
          const leg = await getDrivingLeg(from, to, controller.signal)
          return {
            connectionId: connection.id,
            durationMinutes: Math.ceil(leg.duration / 60),
          }
        } catch (error) {
          if (error.name === 'AbortError') return null
          console.error('Unable to estimate travel time between itinerary events.', error)
          return { connectionId: connection.id, error: true }
        }
      }))
      if (!active) return
      const failedRoutes = routeEstimates.filter((estimate) => estimate?.error).length
      const estimatesByConnectionId = new Map(routeEstimates
        .filter((estimate) => estimate && !estimate.error)
        .map((estimate) => [estimate.connectionId, estimate.durationMinutes]))

      function addTravelEvent(
        connection,
        durationMinutes,
        mode,
        isCustomDuration,
        placement,
        displayDurationMinutes = durationMinutes,
      ) {
        const nextStart = getEntryDateTime(connection.to.dayNumber, connection.to)
        const previousStart = getEntryDateTime(connection.from.dayNumber, connection.from)
        if (!nextStart || !previousStart) return
        const endsAtNextActivity = placement === 'before-next'
        let start = new Date(previousStart.getTime() + Number(connection.from.durationMinutes || 0) * 60_000)
        let end = new Date(start.getTime() + durationMinutes * 60_000)
        if (endsAtNextActivity) {
          end = new Date(nextStart)
          start = new Date(end.getTime() - durationMinutes * 60_000)
        }
        const overlapsScheduledEvent = scheduledIntervals.some((interval) => (
          start < interval.end && end > interval.start
        ))
        const overlapsTravelEvent = travelEvents.some((event) => (
          start < event.end && end > event.start
        ))
        if (end > nextStart.getTime()
          || overlapsScheduledEvent
          || overlapsTravelEvent) {
          blockedRoutes += 1
          return
        }

        const destination = connection.to.type === 'Flight'
          ? connection.to.origin || connection.to.place || connection.to.title
          : connection.to.place || connection.to.title
        const modeLabel = mode === 'walking' ? 'Walking' : 'Driving'
        travelEvents.push({
          id: connection.id,
          title: `${mode === 'walking' ? 'Walk' : 'Travel'} to ${destination}`,
          start,
          end,
          classNames: [
            'calendar-type-transit',
            ...(durationMinutes < 30 ? ['calendar-type-transit-short'] : []),
          ],
          editable: false,
          startEditable: false,
          durationEditable: false,
          extendedProps: {
            type: `Travel time · ${formatTravelDuration(displayDurationMinutes)}`,
            place: isCustomDuration ? `Custom ${modeLabel.toLowerCase()} time` : `${modeLabel} estimate`,
            kind: 'travel',
            mode: modeLabel,
            durationLabel: formatTravelDuration(displayDurationMinutes),
          },
        })
      }

      for (const connection of travelConnections) {
        const settings = trip.travelSettings?.[connection.id] ?? {}
        const mode = settings.mode ?? 'driving'
        if (mode === 'off') continue
        const requestedManualDuration = Number(settings.durationMinutes)
        const hasManualDuration = settings.durationMinutes !== ''
          && Number.isFinite(requestedManualDuration)
          && requestedManualDuration > 0
        const manualDuration = hasManualDuration ? Math.max(30, requestedManualDuration) : 0
        function getPlacement() {
          return getTravelPlacement(connection, settings.placement)
        }
        if (hasManualDuration) {
          addTravelEvent(connection, manualDuration, mode, true, getPlacement())
          continue
        }
        if (mode !== 'driving') continue

        const estimatedDurationMinutes = estimatesByConnectionId.get(connection.id)
        if (!Number.isFinite(estimatedDurationMinutes)) continue
        const blockDurationMinutes = Math.max(30, estimatedDurationMinutes)
        addTravelEvent(
          connection,
          blockDurationMinutes,
          mode,
          false,
          getPlacement(),
          estimatedDurationMinutes,
        )
      }

      if (!active) return
      setTravelTimeEvents(travelEvents)
      setTravelTimeError(failedRoutes
        ? `Travel-time estimates failed for ${failedRoutes} route${failedRoutes === 1 ? '' : 's'}.`
        : '')
      setTravelTimeWarning(blockedRoutes
        ? `${blockedRoutes} travel block${blockedRoutes === 1 ? '' : 's'} hidden because there wasn't enough open time to avoid overlapping scheduled items.`
        : '')
      setIsEstimatingTravelTimes(false)
    }

    estimateTravelTimes()
    return () => {
      active = false
      controller.abort()
    }
  }, [calendarDays, scheduledEntries, travelConnections, travelEstimateAttempt, trip.travelSettings])

  useEffect(() => {
    if (overviewRouteResult?.key === overviewRouteKey) return undefined

    let active = true
    const controller = new AbortController()

    async function loadOverviewRoutes() {
      const results = await Promise.all(travelConnections.map(async (connection) => {
        const settings = trip.travelSettings?.[connection.id] ?? {}
        if ((settings.mode ?? 'driving') !== 'driving') return null

        const from = getTravelCoordinates(connection.from, true)
        const to = getTravelCoordinates(connection.to, false)
        if (!isCoordinates(from) || !isCoordinates(to) || getDistanceMeters(from, to) <= 100) return null

        try {
          const route = await getDrivingRoute([from, to], controller.signal)
          const leg = route.legs[0]
          return {
            segment: leg.duration >= 30 * 60
              ? { type: 'driving', coordinates: route.coordinates }
              : null,
            durationSeconds: leg.duration,
            distanceMeters: leg.distance,
          }
        } catch (error) {
          if (error.name === 'AbortError') return null
          console.error('Unable to load a driving route for the trip overview map.', error)
          return { error: true }
        }
      }))

      if (!active) return
      const successfulRoutes = results.filter((result) => result && !result.error)
      const failedRoutes = results.filter((result) => result?.error).length
      const segments = successfulRoutes.flatMap((result) => result.segment ? [result.segment] : [])
      setOverviewRouteResult({
        key: overviewRouteKey,
        segments,
        routeCount: successfulRoutes.length,
        durationSeconds: successfulRoutes.reduce((total, result) => total + result.durationSeconds, 0),
        distanceMeters: successfulRoutes.reduce((total, result) => total + result.distanceMeters, 0),
        error: failedRoutes
          ? `${failedRoutes} driving route${failedRoutes === 1 ? '' : 's'} could not be shown on the overview map.`
          : '',
      })
    }

    loadOverviewRoutes()
    return () => {
      active = false
      controller.abort()
    }
  }, [overviewRouteKey, overviewRouteResult?.key, travelConnections, trip.travelSettings])

  const unscheduledItems = tripExperiences.filter((item) => !item.schedule)
  const availableIdeas = wishlist.filter((item) => !item.tripId)
  const scheduleDays = [...new Set(scheduledEntries.map((item) => item.dayNumber))]
  const activeRouteDayNumber = mapView === 'overview'
    ? 1
    : Math.min(Number(mapView), calendarDays.length)
  const routeItems = useMemo(() => {
    if (mapView === 'overview') return []
    const dayEntries = scheduledEntries.filter((item) => item.dayNumber === activeRouteDayNumber)
    const firstActivity = dayEntries.find((item) => item.type !== 'Stay')
    const day = calendarDays[activeRouteDayNumber - 1]
    if (!firstActivity || !day) return dayEntries

    const [hour, minute] = firstActivity.time.split(':').map(Number)
    const firstActivityStart = new Date(`${day.dateISO}T00:00:00`)
    firstActivityStart.setHours(hour, minute)
    const dayStart = new Date(`${day.dateISO}T00:00:00`)
    const overnightStay = scheduledEntries
      .filter((item) => item.type === 'Stay')
      .map((item) => {
        const stayDay = calendarDays[item.dayNumber - 1]
        if (!stayDay) return null
        const [stayHour, stayMinute] = item.time.split(':').map(Number)
        const start = new Date(`${stayDay.dateISO}T00:00:00`)
        start.setHours(stayHour, stayMinute)
        const end = new Date(start)
        end.setMinutes(end.getMinutes() + Number(item.durationMinutes || 0))
        return { item, start, end }
      })
      .filter((interval) => interval
        && interval.start < firstActivityStart
        && interval.end > dayStart)
      .sort((first, second) => second.start - first.start)[0]?.item

    return overnightStay && !dayEntries.some((item) => item.id === overnightStay.id)
      ? [overnightStay, ...dayEntries]
      : dayEntries
  }, [activeRouteDayNumber, calendarDays, mapView, scheduledEntries])
  const editingScheduledItem = tripExperiences.find((item) => item.id === schedulingItemId && item.schedule)
  const editingActivity = tripActivities.find((activity) => activity.id === editingActivityId)
  const activeTravelConnection = travelConnections.find(
    (connection) => connection.id === activeTravelConnectionId,
  )
  const activeTravelSettings = activeTravelConnection
    ? trip.travelSettings?.[activeTravelConnection.id] ?? {}
    : {}
  const activeTravelMode = activeTravelSettings.mode ?? 'driving'
  const activeTravelManualDuration = Number(activeTravelSettings.durationMinutes)
  const activeTravelHasManualDuration = activeTravelSettings.durationMinutes !== ''
    && Number.isFinite(activeTravelManualDuration)
    && activeTravelManualDuration > 0
  const activeTravelEvent = activeTravelConnection
    ? travelTimeEvents.find((event) => event.id === activeTravelConnection.id)
    : null
  const activeTravelDefaultPlacement = activeTravelConnection
    ? getTravelPlacement(activeTravelConnection, activeTravelSettings.placement)
    : 'before-next'
  const activeTravelFrom = activeTravelConnection
    ? getTravelCoordinates(activeTravelConnection.from, true)
    : null
  const activeTravelTo = activeTravelConnection
    ? getTravelCoordinates(activeTravelConnection.to, false)
    : null
  const canEstimateActiveDriving = isCoordinates(activeTravelFrom)
    && isCoordinates(activeTravelTo)
    && getDistanceMeters(activeTravelFrom, activeTravelTo) > 100
  const activeTravelFromLabel = activeTravelConnection
    ? activeTravelConnection.from.type === 'Stay'
      ? `Overnight stay (${activeTravelConnection.from.place || activeTravelConnection.from.title})`
      : activeTravelConnection.from.title
    : ''
  const activeTravelToLabel = activeTravelConnection
    ? activeTravelConnection.to.type === 'Flight'
      ? activeTravelConnection.to.origin || activeTravelConnection.to.place || activeTravelConnection.to.title
      : activeTravelConnection.to.place || activeTravelConnection.to.title
    : ''

  function formatTime(time) {
    const [hour, minute] = time.split(':').map(Number)
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
  }

  function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (!hours) return `${minutes} min`
    return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
  }

  function updateTravelSetting(connection, field, value) {
    const travelSettings = trip.travelSettings ?? {}
    onUpdateTrip({
      ...trip,
      travelSettings: {
        ...travelSettings,
        [connection.id]: {
          ...(travelSettings[connection.id] ?? {}),
          [field]: value,
        },
      },
    })
  }

  function toggleTravelSettings() {
    setActiveTravelConnectionId((currentId) => (
      currentId ? null : travelConnections[0]?.id ?? null
    ))
  }

  function isScheduleEventAllowed(start, end, event) {
    if (!start || !end) return false
    const day = calendarDays.find((candidate) => candidate.dateISO === formatDateISO(start))
    if (!day || start.getHours() < 6 || start.getHours() >= 23) return false
    if (event.extendedProps.type === 'Stay') {
      const lastDay = calendarDays[calendarDays.length - 1]
      if (!lastDay) return false
      const latestStayEnd = new Date(`${lastDay.dateISO}T23:00:00`)
      latestStayEnd.setDate(latestStayEnd.getDate() + 1)
      return end <= latestStayEnd
    }
    const lastOccupiedMinute = new Date(end.getTime() - 1)
    return formatDateISO(lastOccupiedMinute) === day.dateISO
      && (end.getHours() < 23 || (end.getHours() === 23 && end.getMinutes() === 0))
  }

  function allowScheduleEventDrop(dropInfo, draggedEvent) {
    if (!canEdit) return false
    if (!dropInfo.start || !draggedEvent.start || !draggedEvent.end) return false
    const end = dropInfo.end ?? new Date(dropInfo.start.getTime() + draggedEvent.end.getTime() - draggedEvent.start.getTime())
    return isScheduleEventAllowed(dropInfo.start, end, draggedEvent)
  }

  function updateScheduledTime({ event, revert }) {
    if (!canEdit) {
      revert()
      return
    }
    if (!event.start || !event.end) {
      revert()
      return
    }
    const day = calendarDays.find((candidate) => candidate.dateISO === formatDateISO(event.start))
    if (!day || !isScheduleEventAllowed(event.start, event.end, event)) {
      revert()
      return
    }

    const schedule = {
      tripId: trip.id,
      dayNumber: calendarDays.findIndex((candidate) => candidate.id === day.id) + 1,
      time: formatInputTime(event.start),
      durationMinutes: Math.max(15, Math.round((event.end - event.start) / 60000)),
    }
    if (event.extendedProps.kind === 'activity') {
      const activity = tripActivities.find((item) => item.id === event.id)
      if (activity) {
        onSaveActivity(trip.id, {
          ...activity,
          dayNumber: schedule.dayNumber,
          time: schedule.time,
          durationMinutes: schedule.durationMinutes,
        })
      }
      return
    }
    onScheduleItem(event.id, schedule)
  }

  function handleScheduleEventClick(info) {
    info.jsEvent.preventDefault()
    if (!canEdit) return
    if (info.event.extendedProps.kind === 'travel') {
      setActiveTravelConnectionId(info.event.id)
      return
    }
    setActiveTravelConnectionId(null)
    if (info.event.extendedProps.kind === 'activity') {
      setIsAddingActivity(false)
      setEditingActivityId(info.event.id)
      setSchedulingItemId(null)
      setScheduleView('calendar')
      return
    }
    setSchedulingItemId(info.event.id)
    setEditingActivityId(null)
    setIsAddingActivity(false)
    setScheduleView('calendar')
  }

  return (
    <main className="trip-preview-page">
      <button className="text-button back-to-overview" type="button" onClick={onBack}>← {backLabel}</button>
      <section className="trip-preview-hero">
        <div className="trip-preview-hero-heading">
          <div>
            <p className="eyebrow">{trip.year} · {trip.status}{trip.sharedRole ? ` · ${trip.sharedRole}` : ''}</p>
            <h1>{trip.name}</h1>
          </div>
          <div className="trip-preview-hero-actions">
            {showWishlist && (
              <button
                className={`secondary-button trip-wishlist-toggle ${tripExperiences.length ? 'has-items' : ''}`}
                type="button"
                aria-expanded={isWishListPanelOpen}
                aria-controls="trip-wishlist-panel"
                onClick={() => setIsWishListPanelOpen((isOpen) => !isOpen)}
              >
                Trip wish list <span className="trip-wishlist-count">{tripExperiences.length}</span>
              </button>
            )}
            {canEdit && (
              <button className="secondary-button" type="button" onClick={() => setIsEditingDetails((isEditing) => !isEditing)}>
                {isEditingDetails ? 'Close editor' : 'Edit trip details'}
              </button>
            )}
            {canManageLock && (
              <button
                className="secondary-button"
                type="button"
                aria-pressed={locked}
                onClick={onToggleLock}
              >
                {locked ? 'Unlock trip' : 'Lock contributors'}
              </button>
            )}
            {canShare && (
              <button className="primary-button" type="button" onClick={onShareTrip}>
                Manage access
              </button>
            )}
          </div>
        </div>
        {locked && (
          <p className="trip-lock-notice" role="status">
            {canManageLock
              ? 'Trip locked for contributors. You can still make changes.'
              : 'This trip is locked by the owner and is currently view-only.'}
          </p>
        )}
        <ul className="trip-preview-locations">
          {displayedTripLocations.map((location, index) => <li key={`${location}-${index}`}>{location}</li>)}
        </ul>
        <div className="trip-preview-stats">
          <article><span>When</span><strong>{trip.dates || 'Dates not set'}</strong></article>
          <article><span>Trip length</span><strong>{trip.tripDays ?? trip.days} days</strong></article>
          <article><span>Vacation time</span><strong>{trip.vacationDays} days</strong></article>
          <article><span>Estimated cost</span><strong>{currency.format(trip.estimatedCost)}</strong></article>
          <article><span>Assigned item costs</span><strong>{currency.format(assignedItemsCost)}</strong></article>
          <article><span>Driving time</span><strong>{overviewDrivingTime}</strong></article>
          <article><span>Driving distance</span><strong>{overviewDrivingDistance}</strong></article>
        </div>
      </section>

      {canEdit && isEditingDetails && (
        <TripDetailsForm
          trip={trip}
          minTripDays={minTripDays}
          onCancel={() => setIsEditingDetails(false)}
          onSave={(updatedTrip) => {
            onUpdateTrip(updatedTrip)
            setIsEditingDetails(false)
          }}
        />
      )}

      {showWishlist && <section
        id="trip-wishlist-panel"
        className="trip-preview-experiences trip-wishlist-panel"
        aria-label="Trip wish list"
        hidden={!isWishListPanelOpen}
      >
        <div className="section-heading">
          <div><p className="eyebrow">Trip-linked ideas</p><h2>Linked wish list items</h2></div>
          <div className="trip-ideas-heading-actions">
            <span>{tripExperiences.length} linked · {unscheduledItems.length} to schedule</span>
            <button className="secondary-button" type="button" onClick={() => setIsAddingIdea((isOpen) => !isOpen)}>
              {isAddingIdea ? 'Close picker' : '+ Add from wish list'}
            </button>
          </div>
        </div>
        {isAddingIdea && (
          <div className="trip-idea-picker">
            {availableIdeas.length > 0
              ? availableIdeas.map((item) => (
                <article className="trip-idea-option" key={item.id}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.location || 'Place not set'} · {item.estimatedDays} {item.estimatedDays === 1 ? 'day' : 'days'}</p>
                  </div>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      onUpdateItem(item.id, {
                        tripId: trip.id,
                        status: item.status === 'Visited' ? 'Visited' : 'Assigned',
                        schedule: null,
                      })
                      setIsAddingIdea(false)
                    }}
                  >
                    Add to this trip
                  </button>
                </article>
              ))
              : <p className="wishlist-empty-state">No unassigned ideas right now. Add an idea in the wish list, then come back here.</p>}
          </div>
        )}
        {tripExperiences.length > 0
          ? <div className="preview-experience-list">{tripExperiences.map((item) => (
            <div className="preview-assigned-idea" key={item.id}>
              <article>
                <span className="experience-marker">✦</span>
                <div>
                  <span className={`trip-status status-${item.schedule ? 'scheduled' : item.status.toLowerCase()}`}>
                    {item.schedule ? `Scheduled · Day ${item.schedule.dayNumber}` : item.status === 'Visited' ? 'Visited' : 'Assigned'}
                  </span>
                  <h3>{item.name}</h3>
                  <p>
                    {item.location || 'Place not set'} · {item.estimatedDays} {item.estimatedDays === 1 ? 'day' : 'days'}
                    {item.schedule && ` · ${formatTime(item.schedule.time)}`}
                    {' · '}
                    {currency.format(item.estimatedCost)}
                  </p>
                </div>
                <div className="trip-linked-item-actions">
                  {!item.schedule && (
                    <button
                      className="primary-button schedule-from-trip-button"
                      type="button"
                      onClick={() => setSchedulingItemId(schedulingItemId === item.id ? null : item.id)}
                    >
                      {schedulingItemId === item.id ? 'Close' : 'Schedule on this trip'}
                    </button>
                  )}
                  <button className="text-button" type="button" onClick={() => onOpenWishlistItem(item.id)}>
                    Open in wish list →
                  </button>
                </div>
              </article>
              {schedulingItemId === item.id && (
                <ScheduleItemForm
                  item={item}
                  trips={trips}
                  fixedTripId={trip.id}
                  onCancel={() => setSchedulingItemId(null)}
                  onSave={(schedule) => {
                    onScheduleItem(item.id, schedule)
                    setSchedulingItemId(null)
                  }}
                />
              )}
            </div>
          ))}</div>
          : <p className="wishlist-empty-state">
            {tripExperiences.length > 0
              ? 'All ideas assigned to this trip are scheduled.'
              : 'No ideas are assigned to this trip yet. Add or assign one from the wish list.'}
          </p>}
      </section>}

      <section className="trip-preview-experiences trip-map-browser">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Overview and day routes</p>
            <h2>Trip map</h2>
            <p className="trip-map-summary">
              {mapView === 'overview'
                ? `${tripMapMarkers.length} mapped ${tripMapMarkers.length === 1 ? 'place' : 'places'} across this trip`
                : `Driving directions for Day ${activeRouteDayNumber}`}
            </p>
          </div>
          <label className="trip-route-day-select">
            <span>Map view</span>
            <select
              value={mapView === 'overview' ? 'overview' : String(activeRouteDayNumber)}
              onChange={(event) => setMapView(event.target.value)}
            >
              <option value="overview">Overview</option>
              {calendarDays.map((day, index) => <option key={day.id} value={index + 1}>Day {index + 1}</option>)}
            </select>
          </label>
        </div>
        {mapView === 'overview'
          ? tripMapMarkers.length > 0
            ? <>
              <div className="trip-overview-map-view">
                <TripMap
                  activities={tripMapMarkers}
                  routeSegments={overviewRouteSegments}
                  scrollWheelZoom
                />
              </div>
              <p className="trip-overview-map-note">
                Driving routes of 30 minutes or more are shown.
                {isLoadingOverviewRoutes && ' Loading routes…'}
                {overviewRouteError && ` ${overviewRouteError}`}
              </p>
            </>
            : <p className="empty-map-message">Add key places, activities, or assigned ideas with locations to map this trip.</p>
          : <TripRouteMap
            items={routeItems}
            dayLabel={`Day ${activeRouteDayNumber}`}
            embedded
            scrollWheelZoom
          />}
      </section>

      <section className="trip-preview-experiences">
        <div className="section-heading">
          <div><p className="eyebrow">Day-by-day plan</p><h2>Trip schedule</h2></div>
          <div className="trip-ideas-heading-actions">
            <span>{scheduledEntries.length} {scheduledEntries.length === 1 ? 'scheduled item' : 'scheduled items'}</span>
            {canEdit && (
              <button className="secondary-button" type="button" onClick={() => {
                setIsAddingActivity((isOpen) => !isOpen)
                setEditingActivityId(null)
              }}>
                {isAddingActivity ? 'Close form' : '+ Add activity'}
              </button>
            )}
          </div>
        </div>
        <div className="trip-preview-schedule-tabs" role="tablist" aria-label="Trip schedule format">
          <button type="button" role="tab" aria-selected={scheduleView === 'calendar'} className={scheduleView === 'calendar' ? 'selected' : ''} onClick={() => setScheduleView('calendar')}>Calendar</button>
          <button type="button" role="tab" aria-selected={scheduleView === 'agenda'} className={scheduleView === 'agenda' ? 'selected' : ''} onClick={() => setScheduleView('agenda')}>Agenda</button>
        </div>
        {scheduleView === 'calendar' && (
          <>
            <p className="trip-travel-note">
              Travel estimates shorter than 30 minutes reserve a 30-minute block. Choose whether it follows the previous activity or ends before the next. Click a block to edit it. Driving estimates use mapped road routes; enter walking minutes manually.
            </p>
            {canEdit && travelConnections.length > 0 && (
              <div className="trip-travel-settings">
                <button
                  className="secondary-button"
                  type="button"
                  aria-expanded={Boolean(activeTravelConnection)}
                  aria-controls="trip-travel-settings-editor"
                  onClick={toggleTravelSettings}
                >
                  {activeTravelConnection ? 'Hide travel settings' : 'Manage travel settings'}
                </button>
                {activeTravelConnection && (
                  <div className="trip-travel-setting" id="trip-travel-settings-editor">
                    <div className="trip-travel-setting-heading">
                      <strong>Day {activeTravelConnection.dayNumber}: {activeTravelFromLabel} → {activeTravelToLabel}</strong>
                      <button
                        className="text-button"
                        type="button"
                        aria-label="Close travel settings"
                        onClick={() => setActiveTravelConnectionId(null)}
                      >
                        Close
                      </button>
                    </div>
                    {travelConnections.length > 1 && (
                      <label className="trip-travel-setting-connection">
                        <span>Travel segment</span>
                        <select
                          value={activeTravelConnection.id}
                          onChange={(event) => setActiveTravelConnectionId(event.target.value)}
                        >
                          {travelConnections.map((connection) => (
                            <option key={connection.id} value={connection.id}>
                              Day {connection.dayNumber}: {connection.from.title} to {connection.to.title}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <div className="trip-travel-setting-fields">
                      <label>
                        <span>Travel mode</span>
                        <select
                          aria-label={`Travel mode from ${activeTravelFromLabel} to ${activeTravelToLabel}`}
                          value={activeTravelMode}
                          onChange={(event) => updateTravelSetting(activeTravelConnection, 'mode', event.target.value)}
                        >
                          <option value="driving">Driving</option>
                          <option value="walking">Walking</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                      <label>
                        <span>Minutes {activeTravelMode === 'walking' ? '(required; min 30)' : '(optional override; min 30)'}</span>
                        <input
                          aria-label={`Travel minutes from ${activeTravelFromLabel} to ${activeTravelToLabel}`}
                          type="number"
                          min="30"
                          step="1"
                          value={activeTravelSettings.durationMinutes ?? ''}
                          placeholder={activeTravelMode === 'walking' ? 'Enter minutes' : 'Auto'}
                          onChange={(event) => updateTravelSetting(
                            activeTravelConnection,
                            'durationMinutes',
                            event.target.value === '' ? '' : Number(event.target.value),
                          )}
                          onBlur={(event) => {
                            const value = Number(event.target.value)
                            if (event.target.value !== '' && Number.isFinite(value) && value < 30) {
                              updateTravelSetting(activeTravelConnection, 'durationMinutes', 30)
                            }
                          }}
                        />
                      </label>
                      <label>
                        <span>Place block</span>
                        <select
                          aria-label={`Travel block placement from ${activeTravelFromLabel} to ${activeTravelToLabel}`}
                          value={activeTravelDefaultPlacement}
                          onChange={(event) => updateTravelSetting(activeTravelConnection, 'placement', event.target.value)}
                        >
                          <option value="after-previous">After previous activity</option>
                          <option value="before-next">Before next activity</option>
                        </select>
                      </label>
                    </div>
                    {activeTravelEvent?.start && activeTravelEvent?.end
                      && (activeTravelEvent.end - activeTravelEvent.start) / 60000 <= 30 && (
                      <p className="trip-travel-setting-hint">Short travel blocks reserve 30 minutes; placement applies when there is enough open time.</p>
                    )}
                    {activeTravelMode === 'walking' && !activeTravelHasManualDuration && (
                      <p className="trip-travel-setting-hint">Enter walking minutes to add this block.</p>
                    )}
                    {activeTravelMode === 'driving' && !activeTravelHasManualDuration && !canEstimateActiveDriving && (
                      <p className="trip-travel-setting-hint">No mapped driving route is available. Enter minutes to add a block.</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
        {scheduleView === 'calendar' && isEstimatingTravelTimes && (
          <p className="trip-travel-status" role="status">Estimating travel times between mapped locations…</p>
        )}
        {scheduleView === 'calendar' && travelTimeError && (
          <p className="trip-travel-error" role="alert">
            {travelTimeError}
            {' '}
            <button type="button" className="text-button" onClick={() => setTravelEstimateAttempt((attempt) => attempt + 1)}>
              Retry estimates
            </button>
          </p>
        )}
        {scheduleView === 'calendar' && travelTimeWarning && (
          <p className="trip-travel-warning" role="status">{travelTimeWarning}</p>
        )}
        {scheduledEntries.length === 0 && <p className="trip-preview-schedule-empty">Nothing is scheduled yet. Add a trip activity or schedule an assigned idea below.</p>}
        {canEdit && (isAddingActivity || editingActivity) && (
          <TripActivityForm
            key={editingActivity?.id ?? 'new'}
            activity={editingActivity}
            tripDays={calendarDays.length}
            onCancel={() => {
              setIsAddingActivity(false)
              setEditingActivityId(null)
            }}
            onRemove={editingActivity ? () => {
              onRemoveActivity(trip.id, editingActivity.id)
              setEditingActivityId(null)
            } : undefined}
            onSave={(activity, dayNumbers) => {
              onSaveActivities(trip.id, dayNumbers.map((dayNumber) => ({ ...activity, dayNumber })))
              setIsAddingActivity(false)
              setEditingActivityId(null)
            }}
          />
        )}
        {scheduleView === 'calendar'
          ? (
            <Suspense fallback={<p className="calendar-loading">Loading trip calendar…</p>}>
              <TripCalendar
                key={`${calendarDays[0]?.dateISO}-${calendarDays.length}`}
                days={calendarDays}
                events={allCalendarEvents}
                eventAllow={canEdit ? allowScheduleEventDrop : () => false}
                dayLabelsOnly
                onEventDrop={updateScheduledTime}
                onEventResize={updateScheduledTime}
                onEventClick={handleScheduleEventClick}
              />
            </Suspense>
          )
          : scheduledEntries.length > 0
            ? <div className="trip-schedule-days">
            {scheduleDays.map((dayNumber) => (
              <section className="trip-schedule-day" key={dayNumber}>
                <h3>Day {dayNumber}</h3>
                <div className="trip-schedule-events">
                  {scheduledEntries.filter((item) => item.dayNumber === dayNumber).map((item) => (
                    <article key={item.id}>
                      <time>{formatTime(item.time)}</time>
                      <div><h4>{item.title}</h4><p>{item.place || item.type} · {formatDuration(item.durationMinutes)}</p></div>
                      <strong>{currency.format(item.cost)}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
            : <p className="wishlist-empty-state">No scheduled ideas to show in the agenda yet.</p>}
        {editingScheduledItem && (
          <ScheduleItemForm
            item={editingScheduledItem}
            trips={trips}
            fixedTripId={trip.id}
            onCancel={() => setSchedulingItemId(null)}
            onRemove={() => {
              onUpdateItem(editingScheduledItem.id, {
                schedule: null,
                status: editingScheduledItem.status === 'Visited' ? 'Visited' : 'Assigned',
              })
              setSchedulingItemId(null)
            }}
            onSave={(schedule) => {
              onScheduleItem(editingScheduledItem.id, schedule)
              setSchedulingItemId(null)
            }}
          />
        )}
      </section>

    </main>
  )
}

export default TripPreview
