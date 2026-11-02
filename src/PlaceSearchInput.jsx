import { useRef, useState } from 'react'
import { searchForPlaces } from './places.js'

function PlaceSearchInput({ value, onChange, onSelect, details = '', placeholder = 'Place, address, or landmark', ariaLabel, required = false }) {
  const [results, setResults] = useState([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const requestId = useRef(0)

  function updateQuery(query) {
    requestId.current += 1
    setResults([])
    setMessage('')
    setError('')
    setIsSearching(false)
    onChange(query)
  }

  async function search() {
    const query = value.trim()
    if (!query) return

    const currentRequestId = ++requestId.current
    setIsSearching(true)
    setResults([])
    setMessage('')
    setError('')
    try {
      const places = await searchForPlaces(query)
      if (requestId.current === currentRequestId) {
        setResults(places)
        if (places.length === 0) setMessage('No matches found. Try adding a city or region.')
      }
    } catch (searchError) {
      if (requestId.current === currentRequestId) {
        setError(searchError instanceof Error
          ? searchError.message
          : 'Place search failed. Check your connection and try again.')
      }
    } finally {
      if (requestId.current === currentRequestId) setIsSearching(false)
    }
  }

  function selectPlace(place) {
    requestId.current += 1
    setIsSearching(false)
    setResults([])
    setError('')
    setMessage(`Selected ${place.name}${place.details ? `, ${place.details}` : ''}.`)
    onSelect(place)
  }

  return (
    <div className="shared-place-search">
      <div className="shared-place-search-row">
        <input aria-label={ariaLabel} value={value} onChange={(event) => updateQuery(event.target.value)} placeholder={placeholder} required={required} />
        <button type="button" className="place-search-button" onClick={search} disabled={!value.trim() || isSearching}>
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </div>
      <small className="place-search-note">Search term sent to Photon.</small>
      {details && <small className="place-selected-detail">{details}</small>}
      {error && <p className="place-search-feedback search-error" role="alert">{error}</p>}
      {message && <p className="place-search-feedback" aria-live="polite">{message}</p>}
      {results.length > 0 && (
        <div className="place-search-results" aria-label="Place search results">
          {results.map((place) => (
            <button className="place-result" type="button" key={place.id} onClick={() => selectPlace(place)}>
              <span className="place-result-name">{place.name}</span>
              {place.details && <span className="place-result-details">{place.details}</span>}
            </button>
          ))}
          <p className="place-search-attribution">Place results by Photon using OpenStreetMap data.</p>
        </div>
      )}
    </div>
  )
}

export default PlaceSearchInput
