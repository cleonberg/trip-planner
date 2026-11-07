const { randomBytes, randomUUID, createHash, timingSafeEqual } = require('node:crypto')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, Timestamp, getFirestore } = require('firebase-admin/firestore')
const { HttpsError, onCall } = require('firebase-functions/https')
const { setGlobalOptions } = require('firebase-functions')

setGlobalOptions({ region: 'us-central1', maxInstances: 5 })
initializeApp()

const db = getFirestore()
const inviteLifetimeMs = 7 * 24 * 60 * 60 * 1000

function requireAuthenticatedUser(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before managing trip access.')
  }
  return request.auth
}

function requireDocumentId(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('/')) {
    throw new HttpsError('invalid-argument', `A valid ${label} is required.`)
  }
  return value
}

function getInviteRef(ownerUid, tripId, inviteId) {
  return db.doc(`users/${ownerUid}/trips/${tripId}/invites/${inviteId}`)
}

async function revokePendingTripInvites(ownerUid, tripId, email) {
  const invites = await db.collection(`users/${ownerUid}/trips/${tripId}/invites`)
    .where('email', '==', email)
    .get()
  const pendingInvites = invites.docs.filter((invite) => invite.data().status === 'pending')
  if (pendingInvites.length === 0) return
  const batch = db.batch()
  pendingInvites.forEach((invite) => {
    batch.update(invite.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  })
  await batch.commit()
}

function getMemberRef(ownerUid, tripId, memberUid) {
  return db.doc(`users/${ownerUid}/trips/${tripId}/members/${memberUid}`)
}

function getSharedTripRef(memberUid, ownerUid, tripId) {
  const membershipId = createHash('sha256')
    .update(`${ownerUid}\0${tripId}`)
    .digest('hex')
  return db.doc(`users/${memberUid}/sharedTrips/${membershipId}`)
}

function getFamilyMemberRef(ownerUid, memberId) {
  return db.doc(`users/${ownerUid}/familyMembers/${memberId}`)
}

async function updateFamilyTripMembership({ ownerUid, memberUid, tripId, role, tripName, email }) {
  const memberRef = getMemberRef(ownerUid, tripId, memberUid)
  const sharedTripRef = getSharedTripRef(memberUid, ownerUid, tripId)
  const batch = db.batch()

  if (role === 'none') {
    batch.delete(memberRef)
    batch.delete(sharedTripRef)
  } else {
    const memberRole = role === 'contributor' ? 'editor' : 'viewer'
    batch.set(memberRef, {
      userId: memberUid,
      email,
      role: memberRole,
      invitedBy: ownerUid,
      addedAt: FieldValue.serverTimestamp(),
    })
    batch.set(sharedTripRef, {
      ownerUid,
      tripId,
      tripName: tripName || 'Shared trip',
      role,
      joinedAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
}

async function findVerifiedAccount(email) {
  try {
    const account = await getAuth().getUserByEmail(email)
    return account.emailVerified ? account : null
  } catch (error) {
    if (error.code === 'auth/user-not-found') return null
    throw error
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function tokenMatches(token, expectedHash) {
  if (typeof token !== 'string' || typeof expectedHash !== 'string') return false
  const actual = Buffer.from(hashToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function requireOwner(request, ownerUid) {
  const auth = requireAuthenticatedUser(request)
  if (auth.uid !== ownerUid) {
    throw new HttpsError('permission-denied', 'Only the trip owner can manage access.')
  }
  return auth
}

exports.createTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const email = typeof request.data?.email === 'string'
    ? request.data.email.trim().toLowerCase()
    : ''
  const role = request.data?.role

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  }
  if (role !== 'viewer' && role !== 'editor') {
    throw new HttpsError('invalid-argument', 'Choose viewer or editor access.')
  }
  if (auth.token.email && auth.token.email.toLowerCase() === email) {
    throw new HttpsError('failed-precondition', 'You already own this trip.')
  }

  const tripRef = db.doc(`users/${auth.uid}/trips/${tripId}`)
  const tripSnapshot = await tripRef.get()
  if (!tripSnapshot.exists) {
    throw new HttpsError('not-found', 'That trip could not be found.')
  }

  const inviteId = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = Timestamp.fromMillis(Date.now() + inviteLifetimeMs)
  await getInviteRef(auth.uid, tripId, inviteId).create({
    email,
    role,
    status: 'pending',
    tokenHash: hashToken(token),
    createdBy: auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  })

  return { inviteId, token, expiresAt: expiresAt.toMillis() }
})

exports.acceptTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const email = typeof auth.token.email === 'string' ? auth.token.email.toLowerCase() : ''
  if (!email || auth.token.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Sign in with a verified Google email to accept this invite.')
  }

  const ownerUid = requireDocumentId(request.data?.ownerUid, 'owner ID')
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const inviteId = requireDocumentId(request.data?.inviteId, 'invite ID')
  const token = request.data?.token
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
    throw new HttpsError('invalid-argument', 'This invite link is invalid.')
  }

  const inviteRef = getInviteRef(ownerUid, tripId, inviteId)
  const tripRef = db.doc(`users/${ownerUid}/trips/${tripId}`)
  const memberRef = getMemberRef(ownerUid, tripId, auth.uid)
  const sharedTripRef = getSharedTripRef(auth.uid, ownerUid, tripId)

  await db.runTransaction(async (transaction) => {
    const [inviteSnapshot, tripSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(tripRef),
    ])
    if (!inviteSnapshot.exists || !tripSnapshot.exists) {
      throw new HttpsError('not-found', 'This invite or trip no longer exists.')
    }

    const invite = inviteSnapshot.data()
    if (!tokenMatches(token, invite.tokenHash)) {
      throw new HttpsError('permission-denied', 'This invite link is invalid.')
    }
    if (invite.email !== email) {
      throw new HttpsError('permission-denied', `This invite was sent to ${invite.email}. Sign in with that Google account.`)
    }
    if (invite.status === 'accepted' && invite.acceptedBy === auth.uid) return
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', 'This invite has already been used or revoked.')
    }
    if (!(invite.expiresAt instanceof Timestamp) || invite.expiresAt.toMillis() <= Date.now()) {
      throw new HttpsError('deadline-exceeded', 'This invite has expired. Ask the owner for a new one.')
    }

    const member = {
      userId: auth.uid,
      email,
      role: invite.role,
      invitedBy: ownerUid,
      addedAt: FieldValue.serverTimestamp(),
    }
    transaction.set(memberRef, member)
    transaction.set(sharedTripRef, {
      ownerUid,
      tripId,
      tripName: tripSnapshot.data().name ?? 'Shared trip',
      role: invite.role,
      inviteId,
      joinedAt: FieldValue.serverTimestamp(),
    })
    transaction.update(inviteRef, {
      status: 'accepted',
      acceptedBy: auth.uid,
      acceptedAt: FieldValue.serverTimestamp(),
    })
  })

  return { ownerUid, tripId }
})

exports.revokeTripInvite = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const inviteId = requireDocumentId(request.data?.inviteId, 'invite ID')
  const inviteRef = getInviteRef(auth.uid, tripId, inviteId)

  const inviteSnapshot = await inviteRef.get()
  if (!inviteSnapshot.exists) {
    throw new HttpsError('not-found', 'That invite could not be found.')
  }
  if (inviteSnapshot.data().status !== 'pending') {
    throw new HttpsError('failed-precondition', 'Only a pending invite can be revoked.')
  }
  requireOwner(request, auth.uid)
  await inviteRef.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  return { inviteId }
})

exports.revokeTripMember = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const tripId = requireDocumentId(request.data?.tripId, 'trip ID')
  const memberUid = requireDocumentId(request.data?.memberUid, 'member ID')
  requireOwner(request, auth.uid)

  if (memberUid === auth.uid) {
    throw new HttpsError('failed-precondition', 'The owner cannot remove themselves from the trip.')
  }

  const memberRef = getMemberRef(auth.uid, tripId, memberUid)
  const memberSnapshot = await memberRef.get()
  if (!memberSnapshot.exists) {
    throw new HttpsError('not-found', 'That trip member could not be found.')
  }
  await db.batch()
    .delete(memberRef)
    .delete(getSharedTripRef(memberUid, auth.uid, tripId))
    .commit()

  return { memberUid }
})

exports.setFamilyTripAccess = onCall(async (request) => {
  const auth = requireOwner(request, request.auth?.uid)
  const memberId = requireDocumentId(request.data?.memberId, 'family member ID')
  const requestedTripIds = Array.isArray(request.data?.tripIds)
    ? request.data.tripIds
    : [request.data?.tripId]
  if (requestedTripIds.length === 0 || requestedTripIds.length > 50) {
    throw new HttpsError('invalid-argument', 'Choose between 1 and 50 trips.')
  }
  const tripIds = requestedTripIds.map((tripId) => requireDocumentId(tripId, 'trip ID'))
  if (new Set(tripIds).size !== tripIds.length) {
    throw new HttpsError('invalid-argument', 'A trip can only be selected once.')
  }
  const role = request.data?.role
  if (!['none', 'viewer', 'contributor'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Choose none, viewer, or contributor access.')
  }

  const familyMemberRef = getFamilyMemberRef(auth.uid, memberId)
  const [familyMemberSnapshot, tripSnapshots] = await Promise.all([
    familyMemberRef.get(),
    Promise.all(tripIds.map((tripId) => db.doc(`users/${auth.uid}/trips/${tripId}`).get())),
  ])
  if (!familyMemberSnapshot.exists) {
    throw new HttpsError('not-found', 'That family member could not be found.')
  }
  if (tripSnapshots.some((tripSnapshot) => !tripSnapshot.exists)) {
    throw new HttpsError('not-found', 'That trip could not be found.')
  }

  const familyMember = familyMemberSnapshot.data()
  const email = typeof familyMember.email === 'string' ? familyMember.email.toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpsError('failed-precondition', 'The family member email address is invalid.')
  }
  const account = role === 'none' ? null : await findVerifiedAccount(email)
  const memberUid = account?.uid ?? familyMember.accountUid
  if (memberUid === auth.uid && role !== 'none') {
    throw new HttpsError('failed-precondition', 'You already own this trip.')
  }
  const access = { ...(familyMember.access ?? {}) }
  const pendingAccess = { ...(familyMember.pendingAccess ?? {}) }
  tripIds.forEach((tripId) => {
    if (role === 'none') {
      delete access[tripId]
      delete pendingAccess[tripId]
    } else {
      access[tripId] = role
      if (memberUid) delete pendingAccess[tripId]
      else pendingAccess[tripId] = true
    }
  })

  const pendingInviteSnapshots = await Promise.all(tripIds.map((tripId) => (
    db.collection(`users/${auth.uid}/trips/${tripId}/invites`)
      .where('email', '==', email)
      .get()
  )))
  const pendingInvites = pendingInviteSnapshots.flatMap((snapshot) => (
    snapshot.docs.filter((invite) => invite.data().status === 'pending')
  ))
  if (pendingInvites.length + tripIds.length * (memberUid && memberUid !== auth.uid ? 2 : 0) + 1 > 500) {
    throw new HttpsError('resource-exhausted', 'Too many existing invitations to update these trips at once.')
  }

  const batch = db.batch()
  batch.update(familyMemberRef, {
    access,
    pendingAccess,
    ...(account ? { accountUid: account.uid } : {}),
  })
  pendingInvites.forEach((invite) => {
    batch.update(invite.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp() })
  })
  if (memberUid && memberUid !== auth.uid) {
    tripIds.forEach((tripId, index) => {
      const memberRef = getMemberRef(auth.uid, tripId, memberUid)
      const sharedTripRef = getSharedTripRef(memberUid, auth.uid, tripId)
      if (role === 'none') {
        batch.delete(memberRef)
        batch.delete(sharedTripRef)
        return
      }
      batch.set(memberRef, {
        userId: memberUid,
        email,
        role: role === 'contributor' ? 'editor' : 'viewer',
        invitedBy: auth.uid,
        addedAt: FieldValue.serverTimestamp(),
      })
      batch.set(sharedTripRef, {
        ownerUid: auth.uid,
        tripId,
        tripName: tripSnapshots[index].data().name || 'Shared trip',
        role,
        joinedAt: FieldValue.serverTimestamp(),
      })
    })
  }
  await batch.commit()

  return {
    memberId,
    tripId: tripIds[0],
    tripIds,
    role,
    pending: role !== 'none' && !memberUid,
  }
})

exports.syncFamilyTripAccess = onCall(async (request) => {
  const auth = requireAuthenticatedUser(request)
  const email = typeof auth.token.email === 'string' ? auth.token.email.toLowerCase() : ''
  if (!email || auth.token.email_verified !== true) {
    return { synced: 0 }
  }

  const contacts = await db.collectionGroup('familyMembers').where('email', '==', email).get()
  let synced = 0
  for (const contactSnapshot of contacts.docs) {
    const ownerUid = contactSnapshot.ref.parent.parent?.id
    if (!ownerUid || ownerUid === auth.uid) continue
    const contact = contactSnapshot.data()
    const assignments = contact.access ?? {}
    for (const [tripId, role] of Object.entries(assignments)) {
      if (!['viewer', 'contributor'].includes(role)) continue
      const tripSnapshot = await db.doc(`users/${ownerUid}/trips/${tripId}`).get()
      if (!tripSnapshot.exists) continue
      await updateFamilyTripMembership({
        ownerUid,
        memberUid: auth.uid,
        tripId,
        role,
        tripName: tripSnapshot.data().name,
        email,
      })
      const pendingAccess = { ...(contact.pendingAccess ?? {}) }
      delete pendingAccess[tripId]
      await contactSnapshot.ref.update({ pendingAccess, accountUid: auth.uid })
      synced += 1
    }
  }

  return { synced }
})

exports.deleteFamilyMember = onCall(async (request) => {
  const auth = requireOwner(request, request.auth?.uid)
  const memberId = requireDocumentId(request.data?.memberId, 'family member ID')
  const familyMemberRef = getFamilyMemberRef(auth.uid, memberId)
  const familyMemberSnapshot = await familyMemberRef.get()
  if (!familyMemberSnapshot.exists) {
    throw new HttpsError('not-found', 'That family member could not be found.')
  }

  const familyMember = familyMemberSnapshot.data()
  const email = typeof familyMember.email === 'string' ? familyMember.email.toLowerCase() : ''
  const account = await findVerifiedAccount(email)
  const memberUid = account?.uid ?? familyMember.accountUid
  if (memberUid && memberUid !== auth.uid) {
    for (const tripId of Object.keys(familyMember.access ?? {})) {
      await revokePendingTripInvites(auth.uid, tripId, email)
      await updateFamilyTripMembership({
        ownerUid: auth.uid,
        memberUid,
        tripId,
        role: 'none',
        email,
      })
    }
  }
  await familyMemberRef.delete()
  return { memberId }
})
