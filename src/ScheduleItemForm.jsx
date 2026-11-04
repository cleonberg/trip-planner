import { useState } from 'react'
import DurationInput from './DurationInput.jsx'

function ScheduleItemForm({ item, trips, fixedTripId, onSave, onCancel, onRemove }) {
  const [tripId, setTripId] = useState(fixedTripId ?? item.tripId ?? '')
  const [dayNumber, setDayNumber] = useState(item.schedule?.dayNumber ?? 1)
  const [time, setTime] = useState(item.schedule?.time ?? '09:00')
  const [durationMinutes, setDurationMinutes] = useState(String(item.schedule?.durationMinutes ?? 120))
  const trip = trips.find((availableTrip) => availableTrip.id === tripId)
  const dayCount = Math.max(1, trip?.tripDays ?? trip?.days ?? 1)

  function changeTrip(nextTripId) {
    setTripId(nextTripId)
    const nextTrip = trips.find((availableTrip) => availableTrip.id === nextTripId)
    const nextDayCount = Math.max(1, nextTrip?.tripDays ?? nextTrip?.days ?? 1)
    setDayNumber((currentDay) => Math.min(currentDay, nextDayCount))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!tripId) return
    onSave({
      tripId,
      dayNumber,
      time,
      durationMinutes: Number(durationMinutes),
    })
  }

  return (
    <form className="schedule-item-form" onSubmit={handleSubmit}>
      <div>
        <strong>{item.schedule ? 'Edit itinerary time' : 'Schedule this idea'}</strong>
        <p>This creates a time block on the selected trip day.</p>
      </div>
      <div className="schedule-item-fields">
        {fixedTripId
          ? <div className="schedule-fixed-trip"><span>Trip</span><strong>{trip?.name}</strong></div>
          : (
            <label>
              <span>Trip</span>
              <select required value={tripId} onChange={(event) => changeTrip(event.target.value)}>
                <option value="" disabled>Select a trip</option>
                {trips.map((availableTrip) => <option key={availableTrip.id} value={availableTrip.id}>{availableTrip.name} · {availableTrip.year}</option>)}
              </select>
            </label>
          )}
        <label>
          <span>Trip day</span>
          <select value={dayNumber} onChange={(event) => setDayNumber(Number(event.target.value))}>
            {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
          </select>
        </label>
        <label>
          <span>Start time</span>
          <input required type="time" min="06:00" max="22:45" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <DurationInput value={durationMinutes} maxMinutes={1020} onChange={setDurationMinutes} />
      </div>
      <div className="schedule-item-actions">
        {item.schedule && onRemove && <button className="text-button unschedule-button" type="button" onClick={onRemove}>Remove from schedule</button>}
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!tripId}>Save schedule</button>
      </div>
    </form>
  )
}

export default ScheduleItemForm
