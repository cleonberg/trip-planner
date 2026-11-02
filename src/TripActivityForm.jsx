import { useState } from 'react'
import PlaceSearchInput from './PlaceSearchInput.jsx'

const activityTypes = ['Travel', 'Flight', 'Food', 'Stay', 'Scenic', 'Hike', 'Other']

function TripActivityForm({ activity, tripDays, onSave, onCancel, onRemove }) {
  const [title, setTitle] = useState(activity?.title ?? '')
  const [type, setType] = useState(activity?.type ?? 'Travel')
  const [place, setPlace] = useState(activity?.place ?? '')
  const [coordinates, setCoordinates] = useState(activity?.coordinates ?? null)
  const [locationDetails, setLocationDetails] = useState(activity?.locationDetails ?? '')
  const [origin, setOrigin] = useState(activity?.origin ?? '')
  const [originDetails, setOriginDetails] = useState(activity?.originDetails ?? '')
  const [originCoordinates, setOriginCoordinates] = useState(activity?.originCoordinates ?? null)
  const [destination, setDestination] = useState(activity?.destination ?? '')
  const [destinationDetails, setDestinationDetails] = useState(activity?.destinationDetails ?? '')
  const [destinationCoordinates, setDestinationCoordinates] = useState(activity?.destinationCoordinates ?? null)
  const [dayNumber, setDayNumber] = useState(activity?.dayNumber ?? 1)
  const [time, setTime] = useState(activity?.time ?? '09:00')
  const [durationMinutes, setDurationMinutes] = useState(activity?.durationMinutes ?? 60)
  const [cost, setCost] = useState(activity?.cost ?? '')

  function handleSubmit(event) {
    event.preventDefault()
    const location = type === 'Flight'
      ? {
          place: `${origin.trim()} → ${destination.trim()}`,
          origin: origin.trim(),
          originDetails,
          originCoordinates,
          destination: destination.trim(),
          destinationDetails,
          destinationCoordinates,
        }
      : {
          place: place.trim(),
          coordinates,
          locationDetails,
        }
    onSave({
      ...(activity?.id ? { id: activity.id } : {}),
      title: title.trim(),
      type,
      ...location,
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
        {type === 'Flight'
          ? (
            <>
              <label>
                <span>Departure airport</span>
                <PlaceSearchInput
                  ariaLabel="Departure airport"
                  value={origin}
                  details={originDetails}
                  required
                  placeholder="Search airport or city"
                  onChange={(value) => {
                    setOrigin(value)
                    setOriginDetails('')
                    setOriginCoordinates(null)
                  }}
                  onSelect={(selectedPlace) => {
                    setOrigin(selectedPlace.name)
                    setOriginDetails(selectedPlace.details)
                    setOriginCoordinates(selectedPlace.coordinates)
                  }}
                />
              </label>
              <label>
                <span>Arrival airport</span>
                <PlaceSearchInput
                  ariaLabel="Arrival airport"
                  value={destination}
                  details={destinationDetails}
                  required
                  placeholder="Search airport or city"
                  onChange={(value) => {
                    setDestination(value)
                    setDestinationDetails('')
                    setDestinationCoordinates(null)
                  }}
                  onSelect={(selectedPlace) => {
                    setDestination(selectedPlace.name)
                    setDestinationDetails(selectedPlace.details)
                    setDestinationCoordinates(selectedPlace.coordinates)
                  }}
                />
              </label>
            </>
          )
          : (
            <label>
              <span>Location</span>
              <PlaceSearchInput
                ariaLabel="Activity location"
                value={place}
                details={locationDetails}
                onChange={(value) => {
                  setPlace(value)
                  setCoordinates(null)
                  setLocationDetails('')
                }}
                onSelect={(selectedPlace) => {
                  setPlace(selectedPlace.name)
                  setCoordinates(selectedPlace.coordinates)
                  setLocationDetails(selectedPlace.details)
                }}
              />
            </label>
          )}
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
