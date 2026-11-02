const placeSearchCache = new Map()
let placeSearchQueue = Promise.resolve()
let lastPlaceSearchAt = 0

function getPlaceSearchResults(features) {
  return features.flatMap((feature, index) => {
    const [longitude, latitude] = feature.geometry?.coordinates ?? []
    if (
      typeof longitude !== 'number'
      || typeof latitude !== 'number'
      || longitude < -180
      || longitude > 180
      || latitude < -90
      || latitude > 90
    ) {
      return []
    }

    const properties = feature.properties ?? {}
    const street = [properties.housenumber, properties.street].filter(Boolean).join(' ')
    const areas = [
      properties.city || properties.town || properties.village,
      properties.state,
      properties.country,
    ].filter(Boolean)
    const name = properties.name || street || areas[0] || `Place ${index + 1}`
    const details = [...new Set([street, ...areas].filter((part) => part && part !== name))].join(', ')

    return [{
      id: `${properties.osm_type ?? 'place'}-${properties.osm_id ?? `${longitude}-${latitude}`}`,
      name,
      details,
      coordinates: { lat: latitude, lng: longitude },
    }]
  })
}

export function searchForPlaces(query) {
  const cacheKey = query.trim().toLowerCase()
  const cachedResults = placeSearchCache.get(cacheKey)
  if (cachedResults) return Promise.resolve(cachedResults)

  const request = placeSearchQueue.then(async () => {
    const queuedCache = placeSearchCache.get(cacheKey)
    if (queuedCache) return queuedCache

    const wait = Math.max(0, 1000 - (Date.now() - lastPlaceSearchAt))
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    lastPlaceSearchAt = Date.now()

    const url = new URL('https://photon.komoot.io/api/')
    url.searchParams.set('q', query.trim())
    url.searchParams.set('limit', '5')
    url.searchParams.set('lang', 'en')
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Place search returned ${response.status}`)
    }

    const data = await response.json()
    if (!Array.isArray(data.features)) {
      throw new Error('Place search returned an invalid response')
    }

    const results = getPlaceSearchResults(data.features)
    placeSearchCache.set(cacheKey, results)
    return results
  })

  placeSearchQueue = request.then(() => undefined, () => undefined)
  return request
}
