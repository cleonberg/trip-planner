import { Suspense, lazy, useMemo, useState } from 'react'
import ScheduleItemForm from './ScheduleItemForm.jsx'
import TripActivityForm from './TripActivityForm.jsx'
import TripDetailsForm from './TripDetailsForm.jsx'
import TripRouteMap from './TripRouteMap.jsx'
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

function TripPreview({ trip, minTripDays, wishlist, trips, onBack, onOpenWishlist, onScheduleItem, onSaveActivity, onRemoveActivity, onUpdateItem, onUpdateTrip }) {
  const [schedulingItemId, setSchedulingItemId] = useState(null)
  const [scheduleView, setScheduleView] = useState('calendar')
  const [isEditingDetails, setIsEditingDetails] = useState(false)
  const [isAddingIdea, setIsAddingIdea] = useState(false)
  const [isAddingActivity, setIsAddingActivity] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [routeDayNumber, setRouteDayNumber] = useState(1)
  const tripExperiences = useMemo(
    () => wishlist.filter((item) => item.tripId === trip.id),
    [trip.id, wishlist],
  )
  const tripActivities = useMemo(() => trip.activities ?? [], [trip.activities])
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
  const unscheduledItems = tripExperiences.filter((item) => !item.schedule)
  const availableIdeas = wishlist.filter((item) => !item.tripId)
  const scheduleDays = [...new Set(scheduledEntries.map((item) => item.dayNumber))]
  const activeRouteDayNumber = Math.min(routeDayNumber, calendarDays.length)
  const routeItems = useMemo(
    () => scheduledEntries.filter((item) => item.dayNumber === activeRouteDayNumber),
    [activeRouteDayNumber, scheduledEntries],
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

  function updateScheduledTime({ event, revert }) {
    if (!event.start || !event.end) {
      revert()
      return
    }
    const day = calendarDays.find((candidate) => candidate.dateISO === formatDateISO(event.start))
    const lastOccupiedMinute = new Date(event.end.getTime() - 1)
    if (
      !day
      || formatDateISO(lastOccupiedMinute) !== day.dateISO
      || event.start.getHours() < 6
      || event.end.getHours() > 23
      || (event.end.getHours() === 23 && event.end.getMinutes() > 0)
    ) {
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
          <button className="secondary-button" type="button" onClick={() => setIsEditingDetails((isEditing) => !isEditing)}>
            {isEditingDetails ? 'Close editor' : 'Edit trip details'}
          </button>
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
        {scheduledEntries.length === 0 && <p className="trip-preview-schedule-empty">Nothing is scheduled yet. Add a trip activity or schedule an assigned idea below.</p>}
        {scheduleView === 'calendar'
          ? (
            <Suspense fallback={<p className="calendar-loading">Loading trip calendar…</p>}>
              <TripCalendar
                key={`${calendarDays[0]?.dateISO}-${calendarDays.length}`}
                days={calendarDays}
                events={calendarEvents}
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

      <section className="trip-preview-experiences">
        <div className="section-heading">
          <div><p className="eyebrow">Getting around</p><h2>Routes for the day</h2></div>
          <label className="trip-route-day-select">
            <span>Trip day</span>
            <select value={activeRouteDayNumber} onChange={(event) => setRouteDayNumber(Number(event.target.value))}>
              {calendarDays.map((day, index) => <option key={day.id} value={index + 1}>Day {index + 1}</option>)}
            </select>
          </label>
        </div>
        <TripRouteMap items={routeItems} dayLabel={`Day ${activeRouteDayNumber}`} />
      </section>

      <section className="trip-preview-experiences">
        <div className="section-heading">
          <div><p className="eyebrow">Not on the itinerary yet</p><h2>Assigned ideas to schedule</h2></div>
          <div className="trip-ideas-heading-actions">
            <span>{unscheduledItems.length} {unscheduledItems.length === 1 ? 'idea' : 'ideas'}</span>
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
        {unscheduledItems.length > 0
          ? <div className="preview-experience-list">{unscheduledItems.map((item) => (
            <div className="preview-assigned-idea" key={item.id}>
              <article>
                <span className="experience-marker">✦</span>
                <div>
                  <span className="trip-status status-assigned">Assigned</span>
                  <h3>{item.name}</h3>
                  <p>{item.location} · {item.estimatedDays} {item.estimatedDays === 1 ? 'day' : 'days'} · {currency.format(item.estimatedCost)}</p>
                </div>
                <button
                  className="primary-button schedule-from-trip-button"
                  type="button"
                  onClick={() => setSchedulingItemId(schedulingItemId === item.id ? null : item.id)}
                >
                  {schedulingItemId === item.id ? 'Close' : 'Schedule on this trip'}
                </button>
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

      <section className="trip-preview-calendar-link">
        <div><p className="eyebrow">Want to plan more?</p><h2>Wish list</h2><p>Assign experiences to this trip and place them on its day-by-day schedule.</p></div>
        <button className="primary-button" type="button" onClick={onOpenWishlist}>Manage wish list →</button>
      </section>
    </main>
  )
}

export default TripPreview
