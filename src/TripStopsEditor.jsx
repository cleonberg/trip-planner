import { useState } from 'react'
import PlaceSearchInput from './PlaceSearchInput.jsx'

function TripStopsEditor({ stops, onChange }) {
  const [name, setName] = useState('')

  function changeName(value) {
    setName(value)
  }

  function addStop(place) {
    if (!place.coordinates) return
    onChange([...stops, {
      id: `stop-${Date.now()}-${stops.length}`,
      name: place.name.trim(),
      details: place.details,
      coordinates: place.coordinates,
    }])
    setName('')
  }

  function removeStop(stopIndex) {
    onChange(stops.filter((_, index) => index !== stopIndex))
  }

  return (
    <section className="trip-stops-editor" aria-label="Trip key places">
      <div>
        <strong>Key places</strong>
        <p className="trip-form-note">Add each city, country, or other important place for this trip. Each selected place gets its own map dot.</p>
      </div>
      <label className="form-field">
        <span>Add a key place</span>
        <PlaceSearchInput
          ariaLabel="Key place"
          value={name}
          onChange={changeName}
          onSelect={addStop}
        />
      </label>
      {stops.length > 0
        ? <ul className="trip-stop-list">
          {stops.map((stop, index) => (
            <li key={stop.id ?? `${stop.name}-${index}`}>
              <span><strong>{stop.name}</strong>{stop.details && <small>{stop.details}</small>}</span>
              <button className="text-button" type="button" aria-label={`Remove ${stop.name}`} onClick={() => removeStop(index)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        : <p className="trip-form-note">No key places added yet.</p>}
    </section>
  )
}

export default TripStopsEditor
