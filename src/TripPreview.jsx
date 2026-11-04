import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import ScheduleItemForm from './ScheduleItemForm.jsx'
import TripActivityForm from './TripActivityForm.jsx'
import TripDetailsForm from './TripDetailsForm.jsx'
import TripMap from './TripMap.jsx'
import TripRouteMap from './TripRouteMap.jsx'
import { getDrivingLeg } from './routing.js'
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

function TripPreview({ trip, minTripDays, wishlist, trips, onBack, onOpenWishlistItem, onScheduleItem, onSaveActivity, onRemoveActivity, onUpdateItem, onUpdateTrip }) {
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
  const [isEstimatingTravelTimes, setIsEstimatingTravelTimes] = useState(false)
  const [travelEstimateAttempt, setTravelEstimateAttempt] = useState(0)
  const tripExperiences = useMemo(
    () => wishlist.filter((item) => item.tripId === trip.id),
    [trip.id, wishlist],
  )
  const tripActivities = useMemo(() => trip.activities ?? [], [trip.activities])
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
      setTravelTimeEvents([])
      setTravelTimeError('')
      setIsEstimatingTravelTimes(true)
      const entriesByDay = new Map()
      scheduledEntries.forEach((entry) => {
        const entries = entriesByDay.get(entry.dayNumber) ?? []
        entries.push(entry)
        entriesByDay.set(entry.dayNumber, entries)
      })

      const travelEvents = []
      let failedRoutes = 0
      function getEntryDateTime(dayNumber, entry) {
        const day = calendarDays[dayNumber - 1]
        if (!day) return null
        const [hour, minute] = entry.time.split(':').map(Number)
        const date = new Date(`${day.dateISO}T00:00:00`)
        date.setHours(hour, minute)
        return date
      }

      function addTravelEvent(id, next, start, durationMinutes) {
        const end = new Date(start)
        end.setMinutes(end.getMinutes() + durationMinutes)
        const destination = next.type === 'Flight'
          ? next.origin || next.place || next.title
          : next.place || next.title
        travelEvents.push({
          id,
          title: `Travel to ${destination}`,
          start,
          end,
          classNames: ['calendar-type-transit'],
          editable: false,
          startEditable: false,
          durationEditable: false,
          extendedProps: {
            type: `Travel time · ${formatTravelDuration(durationMinutes)}`,
            place: 'Driving estimate',
            kind: 'travel',
          },
        })
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

      for (const [dayNumber, entries] of entriesByDay) {
        const day = calendarDays[dayNumber - 1]
        if (!day) continue

        for (let index = 0; index < entries.length - 1; index += 1) {
          const previous = entries[index]
          const next = entries[index + 1]
          if (previous.type === 'Stay') continue
          const from = getTravelCoordinates(previous, true)
          const to = getTravelCoordinates(next, false)
          if (!isCoordinates(from) || !isCoordinates(to) || getDistanceMeters(from, to) <= 100) continue

          try {
            const leg = await getDrivingLeg(from, to, controller.signal)
            const durationMinutes = Math.max(1, Math.ceil(leg.duration / 60))
            const [previousHour, previousMinute] = previous.time.split(':').map(Number)
            const start = new Date(`${day.dateISO}T00:00:00`)
            start.setHours(previousHour, previousMinute + Number(previous.durationMinutes || 0))
            addTravelEvent(`travel-${dayNumber}-${previous.id}-${next.id}`, next, start, durationMinutes)
          } catch (error) {
            if (error.name === 'AbortError') return
            console.error('Unable to estimate travel time between itinerary events.', error)
            failedRoutes += 1
          }
        }
      }

      for (const day of calendarDays) {
        const dayNumber = calendarDays.findIndex((candidate) => candidate.id === day.id) + 1
        const entries = entriesByDay.get(dayNumber) ?? []
        const firstActivity = entries.find((entry) => (
          entry.type !== 'Stay' && isCoordinates(getTravelCoordinates(entry, false))
        ))
        if (!firstActivity) continue

        const firstActivityStart = getEntryDateTime(dayNumber, firstActivity)
        if (!firstActivityStart) continue
        const dayStart = new Date(`${day.dateISO}T00:00:00`)
        const stay = stayIntervals
          .filter((interval) => interval.start < firstActivityStart && interval.end > dayStart)
          .sort((first, second) => second.start - first.start)[0]
        if (!stay) continue

        const from = getTravelCoordinates(stay.entry, true)
        const to = getTravelCoordinates(firstActivity, false)
        if (!isCoordinates(from) || !isCoordinates(to) || getDistanceMeters(from, to) <= 100) continue

        try {
          const leg = await getDrivingLeg(from, to, controller.signal)
          const durationMinutes = Math.max(1, Math.ceil(leg.duration / 60))
          const start = new Date(firstActivityStart)
          start.setMinutes(start.getMinutes() - durationMinutes)
          addTravelEvent(
            `travel-stay-${dayNumber}-${stay.entry.id}-${firstActivity.id}`,
            firstActivity,
            start,
            durationMinutes,
          )
        } catch (error) {
          if (error.name === 'AbortError') return
          console.error('Unable to estimate travel time from the overnight stay to the first activity.', error)
          failedRoutes += 1
        }
      }

      if (!active) return
      setTravelTimeEvents(travelEvents)
      setTravelTimeError(failedRoutes
        ? `Travel-time estimates failed for ${failedRoutes} route${failedRoutes === 1 ? '' : 's'}.`
        : '')
      setIsEstimatingTravelTimes(false)
    }

    estimateTravelTimes()
    return () => {
      active = false
      controller.abort()
    }
  }, [calendarDays, scheduledEntries, travelEstimateAttempt])

  const unscheduledItems = tripExperiences.filter((item) => !item.schedule)
  const availableIdeas = wishlist.filter((item) => !item.tripId)
  const scheduleDays = [...new Set(scheduledEntries.map((item) => item.dayNumber))]
  const activeRouteDayNumber = mapView === 'overview'
    ? 1
    : Math.min(Number(mapView), calendarDays.length)
  const routeItems = useMemo(
    () => mapView === 'overview'
      ? []
      : scheduledEntries.filter((item) => item.dayNumber === activeRouteDayNumber),
    [activeRouteDayNumber, mapView, scheduledEntries],
  )
  const editingScheduledItem = tripExperiences.find((item) => item.id === schedulingItemId && item.schedule)
  const editingActivity = tripActivities.find((activity) => activity.id === editingActivityId)

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
    if (!dropInfo.start || !draggedEvent.start || !draggedEvent.end) return false
    const end = dropInfo.end ?? new Date(dropInfo.start.getTime() + draggedEvent.end.getTime() - draggedEvent.start.getTime())
    return isScheduleEventAllowed(dropInfo.start, end, draggedEvent)
  }

  function updateScheduledTime({ event, revert }) {
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
    if (info.event.extendedProps.kind === 'travel') return
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
      <button className="text-button back-to-overview" type="button" onClick={onBack}>← Back to lifetime overview</button>
      <section className="trip-preview-hero">
        <div className="trip-preview-hero-heading">
          <div>
            <p className="eyebrow">{trip.year} · {trip.status}</p>
            <h1>{trip.name}</h1>
          </div>
          <div className="trip-preview-hero-actions">
            <button
              className={`secondary-button trip-wishlist-toggle ${tripExperiences.length ? 'has-items' : ''}`}
              type="button"
              aria-expanded={isWishListPanelOpen}
              aria-controls="trip-wishlist-panel"
              onClick={() => setIsWishListPanelOpen((isOpen) => !isOpen)}
            >
              Trip wish list <span className="trip-wishlist-count">{tripExperiences.length}</span>
            </button>
            <button className="secondary-button" type="button" onClick={() => setIsEditingDetails((isEditing) => !isEditing)}>
              {isEditingDetails ? 'Close editor' : 'Edit trip details'}
            </button>
          </div>
        </div>
        <p>{trip.location}{trip.locationDetails ? ` · ${trip.locationDetails}` : ''}</p>
        <div className="trip-preview-stats">
          <article><span>When</span><strong>{trip.dates || 'Dates not set'}</strong></article>
          <article><span>Trip length</span><strong>{trip.tripDays ?? trip.days} days</strong></article>
          <article><span>Vacation time</span><strong>{trip.vacationDays} days</strong></article>
          <article><span>Estimated cost</span><strong>{currency.format(trip.estimatedCost)}</strong></article>
        </div>
      </section>

      {isEditingDetails && (
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

      <section
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
      </section>

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
            ? <div className="trip-overview-map-view"><TripMap activities={tripMapMarkers} scrollWheelZoom /></div>
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
            <button className="secondary-button" type="button" onClick={() => {
              setIsAddingActivity((isOpen) => !isOpen)
              setEditingActivityId(null)
            }}>
              {isAddingActivity ? 'Close form' : '+ Add activity'}
            </button>
          </div>
        </div>
        <div className="trip-preview-schedule-tabs" role="tablist" aria-label="Trip schedule format">
          <button type="button" role="tab" aria-selected={scheduleView === 'calendar'} className={scheduleView === 'calendar' ? 'selected' : ''} onClick={() => setScheduleView('calendar')}>Calendar</button>
          <button type="button" role="tab" aria-selected={scheduleView === 'agenda'} className={scheduleView === 'agenda' ? 'selected' : ''} onClick={() => setScheduleView('agenda')}>Agenda</button>
        </div>
        {scheduleView === 'calendar' && (
          <p className="trip-travel-note">Travel blocks are estimated by car between itinerary events with mapped locations. They are visual only and are not saved to the trip.</p>
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
        {scheduledEntries.length === 0 && <p className="trip-preview-schedule-empty">Nothing is scheduled yet. Add a trip activity or schedule an assigned idea below.</p>}
        {scheduleView === 'calendar'
          ? (
            <Suspense fallback={<p className="calendar-loading">Loading trip calendar…</p>}>
              <TripCalendar
                key={`${calendarDays[0]?.dateISO}-${calendarDays.length}`}
                days={calendarDays}
                events={allCalendarEvents}
                eventAllow={allowScheduleEventDrop}
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
        {(isAddingActivity || editingActivity) && (
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
            onSave={(activity) => {
              onSaveActivity(trip.id, activity)
              setIsAddingActivity(false)
              setEditingActivityId(null)
            }}
          />
        )}
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
