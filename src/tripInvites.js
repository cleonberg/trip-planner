import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase.js'

async function callFunction(name, data) {
  const result = await httpsCallable(functions, name)(data)
  return result.data
}

export function createTripInvite(data) {
  return callFunction('createTripInvite', data)
}

export function acceptTripInvite(data) {
  return callFunction('acceptTripInvite', data)
}

export function revokeTripInvite(data) {
  return callFunction('revokeTripInvite', data)
}

export function revokeTripMember(data) {
  return callFunction('revokeTripMember', data)
}
