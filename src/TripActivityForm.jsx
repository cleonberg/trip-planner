import { useState } from 'react'

const activityTypes = ['Travel', 'Food', 'Stay', 'Scenic', 'Hike', 'Other']

function TripActivityForm({ activity, tripDays, onSave, onCancel, onRemove }) {
  const [title, setTitle] = useState(activity?.title ?? '')
  const [type, setType] = useState(activity?.type ?? 'Travel')
  const [place, setPlace] = useState(activity?.place ?? '')
  const [dayNumber, setDayNumber] = useState(activity?.dayNumber ?? 1)
  const [time, setTime] = useState(activity?.time ?? '09:00')
  const [durationMinutes, setDurationMinutes] = useState(activity?.durationMinutes ?? 60)
  const [cost, setCost] = useState(activity?.cost ?? '')

  function handleSubmit(event) {
    event.preventDefault()
    onSave({
      ...(activity?.id ? { id: activity.id } : {}),
      title: title.trim(),
      type,
      place: place.trim(),
      dayNumber: Number(dayNumber),
      time,
      durationMinutes: Number(durationMinutes),
      cost: Number(cost || 0),
    })
  }

  return (
    <form className="schedule-item-form" onSubmit={handleSubmit}>
      <div>
        <strong>{activity ? 'Edit trip activity' : 'Add a trip activity'}</strong>
        <p>Plan a trip detail such as a flight, transfer, or meal without adding it to your wish list.</p>
      </div>
      <div className="schedule-item-fields">
        <label>
          <span>Activity name</span>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Flight from TRI to Lima" />
        </label>
        <label>
          <span>Type</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            {activityTypes.map((activityType) => <option key={activityType}>{activityType}</option>)}
          </select>
        </label>
        <label>
          <span>Location or route</span>
          <input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="e.g. TRI airport → Lima airport" />
        </label>
        <label>
          <span>Trip day</span>
          <select value={dayNumber} onChange={(event) => setDayNumber(Number(event.target.value))}>
            {Array.from({ length: tripDays }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
          </select>
        </label>
        <label>
          <span>Start time</span>
          <input required type="time" min="06:00" max="22:45" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <label>
          <span>Duration (minutes)</span>
          <input required type="number" min="15" max={Math.max(15, 23 * 60 - (Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))))} step="15" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} />
        </label>
        <label>
          <span>Cost ($)</span>
          <input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" />
        </label>
      </div>
      <div className="schedule-item-actions">
        {activity && onRemove && <button className="text-button unschedule-button" type="button" onClick={onRemove}>Remove activity</button>}
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!title.trim()}>Save activity</button>
      </div>
    </form>
  )
}

export default TripActivityForm
