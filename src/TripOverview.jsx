import { Suspense, lazy, useMemo } from 'react'
import TripMap from './TripMap.jsx'

const TripCalendar = lazy(() => import('./TripCalendar.jsx'))
const dayColors = ['#315a49', '#4b7f75', '#a16e3e', '#687da0', '#8a6685', '#71894e', '#b35e4e']
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function TripOverview({ days, events, onOpenDay, onEventDrop, onEventResize, onEventClick }) {
  const mappedActivities = useMemo(() => days.flatMap((day, index) => day.activities.map((activity) => ({
    ...activity,
    time: `${day.label} · ${activity.time}`,
    mapColor: dayColors[index % dayColors.length],
  }))), [days])

  return (
    <div className="trip-overview">
      <section className="trip-overview-map">
        <div className="section-heading">
          <div><p className="eyebrow">Every stop, every day</p><h2>Trip map</h2></div>
          <span>{mappedActivities.filter((activity) => activity.coordinates).length} mapped stops</span>
        </div>
        {mappedActivities.some((activity) => activity.coordinates)
          ? <TripMap activities={mappedActivities} />
          : <p className="empty-map-message">Pin activities on the daily map to see them here.</p>}
        <div className="trip-day-legend" aria-label="Map legend by day">
          {days.map((day, index) => (
            <span key={day.id}><i style={{ backgroundColor: dayColors[index % dayColors.length] }} />{day.label}</span>
          ))}
        </div>
        <p className="trip-overview-map-note">Map pins are grouped by day. Open a day’s detail view for its driving route.</p>
      </section>

      <section className="trip-day-summaries">
        <div className="section-heading">
          <div><p className="eyebrow">At a glance</p><h2>Daily summaries</h2></div>
          <span>{days.length} days</span>
        </div>
        <div className="trip-day-summary-grid">
          {days.map((day, index) => {
            const cost = day.activities.reduce((sum, activity) => sum + Number(activity.cost || 0), 0)
            const hikingMiles = day.activities.reduce((sum, activity) => sum + Number(activity.miles || 0), 0)
            return (
              <article className="trip-day-summary-card" key={day.id}>
                <div className="trip-day-summary-heading">
                  <span className="trip-day-color" style={{ backgroundColor: dayColors[index % dayColors.length] }} />
                  <div><span>{day.date}</span><h3>{day.title}</h3></div>
                </div>
                <div className="trip-day-summary-metrics">
                  <span>{day.activities.length} {day.activities.length === 1 ? 'activity' : 'activities'}</span>
                  <span>{currency.format(cost)}</span>
                  {hikingMiles > 0 && <span>{hikingMiles.toFixed(1)} hiking mi</span>}
                </div>
                {day.activities.length > 0
                  ? <ul>
                    {day.activities.map((activity) => (
                      <li key={activity.id}>
                        <time>{activity.time}</time>
                        <span>{activity.title}</span>
                      </li>
                    ))}
                  </ul>
                  : <p className="trip-day-empty">No activities yet</p>}
                <button className="text-button" type="button" onClick={() => onOpenDay(day.id)}>Open {day.label} details →</button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="trip-overview-schedule">
        <div className="section-heading">
          <div><p className="eyebrow">Move plans across days</p><h2>Whole-trip schedule</h2></div>
          <span>Drag to move · resize to change duration</span>
        </div>
        <p className="trip-schedule-instructions">Drag an activity to a different day or time. Click an activity to edit its details. Changes also appear in the daily views.</p>
        <Suspense fallback={<p className="calendar-loading">Loading whole-trip schedule…</p>}>
          <TripCalendar
            key={`${days[0]?.dateISO}-${days.length}`}
            days={days}
            events={events}
            onEventDrop={onEventDrop}
            onEventResize={onEventResize}
            onEventClick={onEventClick}
          />
        </Suspense>
      </section>
    </div>
  )
}

export default TripOverview
