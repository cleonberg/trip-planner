import { useState } from 'react'
import PlaceSearchInput from './PlaceSearchInput.jsx'
import DurationInput from './DurationInput.jsx'

const activityTypes = ['Activity', 'Flight', 'Food', 'Hike', 'Other', 'Scenic', 'Stay', 'Travel']

function TripActivityForm({ activity, tripDays, staged = false, onSave, onCancel, onRemove, onStage }) {
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
  const [selectedDayNumbers, setSelectedDayNumbers] = useState(
    activity ? [Number(activity.dayNumber)] : [],
  )
  const [time, setTime] = useState(activity?.time ?? '09:00')
  const [durationMinutes, setDurationMinutes] = useState(String(activity?.durationMinutes ?? 60))
  const [cost, setCost] = useState(String(activity?.cost ?? ''))
  const [imageUrl, setImageUrl] = useState(activity?.imageUrl ?? '')
  const [resourceLinks, setResourceLinks] = useState(() => (
    Array.isArray(activity?.links)
      ? activity.links.map((link) => ({ label: link.label ?? '', url: link.url ?? '' }))
      : []
  ))
  const startMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const lastScheduledDay = activity || selectedDayNumbers.length === 0
    ? Number(dayNumber)
    : Math.max(...selectedDayNumbers)
  const maxDurationMinutes = Math.max(
    15,
    type === 'Stay'
      ? (tripDays - lastScheduledDay + 1) * 24 * 60 + 23 * 60 - startMinutes
      : 23 * 60 - startMinutes,
  )

  function handleSubmit(event) {
    event.preventDefault()
    if (!activity && !staged && selectedDayNumbers.length === 0) return
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
    const dayNumbers = staged ? [] : activity ? [Number(dayNumber)] : selectedDayNumbers
    onSave({
      ...(activity?.id ? { id: activity.id } : {}),
      title: title.trim(),
      type,
      ...location,
      ...(!staged ? { dayNumber: dayNumbers[0], time } : {}),
      durationMinutes: Number(durationMinutes),
      cost: Number(cost || 0),
      imageUrl: imageUrl.trim(),
      links: resourceLinks
        .filter((link) => link.url.trim())
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
    }, dayNumbers)
  }

  return (
    <form className="schedule-item-form" onSubmit={handleSubmit}>
      <div>
        <strong>{activity ? 'Edit trip activity' : 'Add a trip activity'}</strong>
        <p>{staged
          ? 'Keep this idea here until you decide when to fit it into the trip.'
          : activity
            ? 'Edit this trip activity.'
            : 'Plan a trip detail such as a flight, transfer, or meal. Choose multiple days to create separate copies you can edit individually.'}</p>
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
            <label className="schedule-item-location-field">
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
        {!staged && activity
          ? (
            <label>
              <span>Trip day</span>
              <select value={dayNumber} onChange={(event) => setDayNumber(Number(event.target.value))}>
                {Array.from({ length: tripDays }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
              </select>
            </label>
          )
          : !staged && (
            <fieldset className="schedule-item-day-selection">
              <legend>Schedule on days</legend>
              <div className="schedule-item-day-options">
                {Array.from({ length: tripDays }, (_, index) => index + 1).map((day) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      checked={selectedDayNumbers.includes(day)}
                      onChange={(event) => {
                        const isChecked = event.target.checked
                        setSelectedDayNumbers((currentDays) => {
                          const nextDays = isChecked
                            ? [...currentDays, day].sort((first, second) => first - second)
                            : currentDays.filter((currentDay) => currentDay !== day)
                          return nextDays
                        })
                      }}
                    />
                    <span>Day {day}</span>
                  </label>
                ))}
              </div>
              {selectedDayNumbers.length === 0 && (
                <p className="schedule-item-day-selection-hint">Select at least one day.</p>
              )}
            </fieldset>
          )}
        {!staged && <label>
          <span>Start time</span>
          <input required type="time" min="06:00" max="22:45" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>}
        <DurationInput value={durationMinutes} maxMinutes={maxDurationMinutes} onChange={setDurationMinutes} />
        <label>
          <span>Cost ($)</span>
          <input type="number" min="0" step="0.01" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" />
        </label>
        <div className="activity-resource-editor">
          <label>
            <span>Activity image URL</span>
            <input
              type="url"
              pattern="https?://.+"
              title="Use a web address starting with http:// or https://."
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="https://example.com/photo.jpg"
            />
          </label>
          <fieldset className="activity-links-editor">
            <legend>Information links</legend>
            {resourceLinks.map((link, index) => (
              <div className="activity-link-editor-row" key={index}>
                <input
                  aria-label={`Link ${index + 1} label`}
                  value={link.label}
                  onChange={(event) => setResourceLinks((currentLinks) => currentLinks.map((currentLink, linkIndex) => (
                    linkIndex === index ? { ...currentLink, label: event.target.value } : currentLink
                  )))}
                  placeholder="e.g. Official website"
                />
                <input
                  aria-label={`Link ${index + 1} URL`}
                  type="url"
                  pattern="https?://.+"
                  title="Use a web address starting with http:// or https://."
                  required
                  value={link.url}
                  onChange={(event) => setResourceLinks((currentLinks) => currentLinks.map((currentLink, linkIndex) => (
                    linkIndex === index ? { ...currentLink, url: event.target.value } : currentLink
                  )))}
                  placeholder="https://example.com"
                />
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setResourceLinks((currentLinks) => currentLinks.filter((_, linkIndex) => linkIndex !== index))}
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              className="text-button"
              type="button"
              onClick={() => setResourceLinks((currentLinks) => [...currentLinks, { label: '', url: '' }])}
            >
              + Add information link
            </button>
          </fieldset>
        </div>
      </div>
      <div className="schedule-item-actions">
        {activity && onRemove && <button className="text-button unschedule-button" type="button" onClick={onRemove}>Remove activity</button>}
        {!staged && activity && onStage && <button className="text-button unschedule-button" type="button" onClick={onStage}>Move to staging area</button>}
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        <button
          className="primary-button"
          type="submit"
          disabled={!title.trim() || (!staged && !activity && selectedDayNumbers.length === 0)}
        >
          {staged ? 'Save staged idea' : 'Save activity'}
        </button>
      </div>
    </form>
  )
}

export default TripActivityForm
