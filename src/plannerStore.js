import { collection, doc, getDocs, writeBatch } from 'firebase/firestore'
import { db } from './firebase.js'

function getCollections(userId) {
  return {
    trips: collection(db, 'users', userId, 'trips'),
    annualPlans: collection(db, 'users', userId, 'annualPlans'),
    wishlistItems: collection(db, 'users', userId, 'wishlistItems'),
    days: collection(db, 'users', userId, 'trips', 'yosemite', 'days'),
  }
}

function toItems(snapshot) {
  return snapshot.docs.map((document) => ({ ...document.data(), id: document.id }))
}

export async function loadPlannerData(userId) {
  const collections = getCollections(userId)
  const [trips, annualPlans, wishlistItems, days] = await Promise.all(
    Object.values(collections).map((reference) => getDocs(reference)),
  )

  return {
    trips: toItems(trips),
    annualPlans: toItems(annualPlans),
    wishlistItems: toItems(wishlistItems),
    days: toItems(days),
  }
}

function removeUndefined(value) {
  if (Array.isArray(value)) {
    return value.map((item) => item === undefined ? null : removeUndefined(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, removeUndefined(item)]),
    )
  }
  return value
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function getDocumentId(collectionName, item) {
  const id = collectionName === 'annualPlans' ? item.year : item.id
  if (id === undefined || id === null || String(id).includes('/')) {
    throw new Error(`Invalid document ID in ${collectionName}.`)
  }
  return String(id)
}

async function syncCollection(reference, collectionName, previousItems, nextItems) {
  const previous = new Map()
  const next = new Map()
  const operations = []

  previousItems.forEach((item) => {
    const id = getDocumentId(collectionName, item)
    if (previous.has(id)) throw new Error(`Duplicate document ID in ${collectionName}: ${id}`)
    previous.set(id, removeUndefined(item))
  })

  nextItems.forEach((item) => {
    const id = getDocumentId(collectionName, item)
    if (next.has(id)) throw new Error(`Duplicate document ID in ${collectionName}: ${id}`)
    const data = removeUndefined(item)
    next.set(id, data)
    if (!previous.has(id) || stableStringify(previous.get(id)) !== stableStringify(data)) {
      operations.push({ type: 'set', reference: doc(reference, id), data })
    }
  })

  previous.forEach((_, id) => {
    if (!next.has(id)) operations.push({ type: 'delete', reference: doc(reference, id) })
  })

  for (let index = 0; index < operations.length; index += 450) {
    const batch = writeBatch(db)
    operations.slice(index, index + 450).forEach((operation) => {
      if (operation.type === 'set') batch.set(operation.reference, operation.data)
      else batch.delete(operation.reference)
    })
    await batch.commit()
  }
}

export async function savePlannerData(userId, previousData, nextData) {
  const collections = getCollections(userId)
  await Promise.all(
    Object.entries(collections).map(([name, reference]) => (
      syncCollection(reference, name, previousData[name], nextData[name])
    )),
  )
}
