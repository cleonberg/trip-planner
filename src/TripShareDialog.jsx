import { useCallback, useEffect, useState } from 'react'
import {
  createFamilyMember,
  loadFamilyMembers,
  loadTripInvites,
  loadTripMembers,
} from './plannerStore.js'
import {
  deleteFamilyMember,
  revokeTripInvite,
  revokeTripMember,
  setFamilyTripAccess,
} from './tripInvites.js'

function getExpiryLabel(timestamp) {
  if (!timestamp?.toDate) return ''
  return `Expires ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(timestamp.toDate())}`
}

function displayRole(role) {
  return role === 'editor' ? 'contributor' : role
}

function TripShareDialog({ user, trip, onClose }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('viewer')
  const [familyMembers, setFamilyMembers] = useState([])
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [isLoadingAccess, setIsLoadingAccess] = useState(true)
  const [isAddingFamilyMember, setIsAddingFamilyMember] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')

  const refreshAccess = useCallback(async () => {
    setIsLoadingAccess(true)
    setError('')
    try {
      const [nextFamilyMembers, nextMembers, nextInvites] = await Promise.all([
        loadFamilyMembers(user.uid),
        loadTripMembers(user.uid, trip.id),
        loadTripInvites(user.uid, trip.id),
      ])
      setFamilyMembers(nextFamilyMembers)
      setMembers(nextMembers)
      setInvites(nextInvites)
    } catch (loadError) {
      console.error('Unable to load trip access details.', loadError)
      setError(loadError.message)
    } finally {
      setIsLoadingAccess(false)
    }
  }, [trip.id, user.uid])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => {
      if (active) return refreshAccess()
      return undefined
    })
    return () => {
      active = false
    }
  }, [refreshAccess])

  async function handleAddFamilyMember(event) {
    event.preventDefault()
    setIsAddingFamilyMember(true)
    setError('')
    try {
      if (familyMembers.some((member) => member.email?.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error('That email is already in your family list.')
      }
      const familyMember = await createFamilyMember(user.uid, { name, email })
      setFamilyMembers((currentMembers) => [...currentMembers, familyMember])
      setName('')
      setEmail('')
      if (newMemberRole !== 'none') {
        const result = await setFamilyTripAccess({
          memberId: familyMember.id,
          tripId: trip.id,
          role: newMemberRole,
        })
        if (result.pending) {
          setFamilyMembers((currentMembers) => currentMembers.map((member) => (
            member.id === familyMember.id
              ? { ...member, pendingAccess: { ...member.pendingAccess, [trip.id]: true } }
              : member
          )))
        }
      }
      await refreshAccess()
    } catch (createError) {
      console.error('Unable to add family member to trip access.', createError)
      setError(createError.message)
    } finally {
      setIsAddingFamilyMember(false)
    }
  }

  async function handleSetFamilyAccess(memberId, role) {
    setWorkingId(memberId)
    setError('')
    try {
      const result = await setFamilyTripAccess({ memberId, tripId: trip.id, role })
      setFamilyMembers((currentMembers) => currentMembers.map((member) => {
        if (member.id !== memberId) return member
        const access = { ...member.access }
        const pendingAccess = { ...member.pendingAccess }
        if (role === 'none') {
          delete access[trip.id]
          delete pendingAccess[trip.id]
        } else {
          access[trip.id] = role
          if (result.pending) pendingAccess[trip.id] = true
          else delete pendingAccess[trip.id]
        }
        return { ...member, access, pendingAccess }
      }))
      await loadTripMembers(user.uid, trip.id).then(setMembers)
    } catch (accessError) {
      console.error('Unable to update family trip access.', accessError)
      setError(accessError.message)
    } finally {
      setWorkingId('')
    }
  }

  async function handleRemoveFamilyMember(memberId) {
    setWorkingId(memberId)
    setError('')
    try {
      await deleteFamilyMember({ memberId })
      await refreshAccess()
    } catch (removeError) {
      console.error('Unable to remove family member.', removeError)
      setError(removeError.message)
    } finally {
      setWorkingId('')
    }
  }

  async function handleRevokeInvite(inviteId) {
    setWorkingId(inviteId)
    setError('')
    try {
      await revokeTripInvite({ tripId: trip.id, inviteId })
      await refreshAccess()
    } catch (revokeError) {
      console.error('Unable to revoke trip invite.', revokeError)
      setError(revokeError.message)
    } finally {
      setWorkingId('')
    }
  }

  async function handleRemoveMember(memberUid) {
    setWorkingId(memberUid)
    setError('')
    try {
      await revokeTripMember({ tripId: trip.id, memberUid })
      await refreshAccess()
    } catch (revokeError) {
      console.error('Unable to remove trip member.', revokeError)
      setError(revokeError.message)
    } finally {
      setWorkingId('')
    }
  }

  const familyEmails = new Set(familyMembers.map((member) => member.email?.toLowerCase()))
  const legacyMembers = members.filter((member) => (
    member.role !== 'owner' && !familyEmails.has(member.email?.toLowerCase())
  ))

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <button className="close-form dialog-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        <div className="share-dialog-icon">↗</div>
        <h2 id="share-title">Trip access</h2>
        <p>Add family emails once, then choose who can see or contribute to each trip. Family members sign in with that verified email to see trips they can access.</p>
        <form className="trip-invite-form" onSubmit={handleAddFamilyMember}>
          <label className="form-field">
            <span>Name</span>
            <input
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Family member"
            />
          </label>
          <label className="form-field">
            <span>Email address</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="traveler@example.com"
            />
          </label>
          <label className="form-field">
            <span>Access to this trip</span>
            <select value={newMemberRole} onChange={(event) => setNewMemberRole(event.target.value)}>
              <option value="none">None · save to family list only</option>
              <option value="viewer">Viewer · can view the trip</option>
              <option value="contributor">Contributor · can edit the trip</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={isAddingFamilyMember}>
            {isAddingFamilyMember ? 'Adding…' : 'Add family member'}
          </button>
        </form>

        {error && <p className="trip-invite-error" role="alert">{error}</p>}
        <section className="trip-access-list" aria-label="Family trip access">
          <h3>Family access to {trip.name}</h3>
          {isLoadingAccess
            ? <p>Loading access…</p>
            : familyMembers.length > 0
              ? familyMembers.map((member) => (
                <div className="trip-access-row family-access-row" key={member.id}>
                  <span>
                    <strong>{member.name || member.email}</strong>
                    <small>{member.email}</small>
                    {member.pendingAccess?.[trip.id] && <small className="family-access-pending">Waiting for verified sign-in</small>}
                  </span>
                  <select
                    aria-label={`${member.name || member.email} access to ${trip.name}`}
                    value={member.access?.[trip.id] ?? 'none'}
                    disabled={workingId === member.id}
                    onChange={(event) => handleSetFamilyAccess(member.id, event.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="viewer">Viewer</option>
                    <option value="contributor">Contributor</option>
                  </select>
                  <button
                    className="text-button"
                    type="button"
                    disabled={workingId === member.id}
                    onClick={() => handleRemoveFamilyMember(member.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
              : <p>No family members yet. Add their emails above to get started.</p>}
        </section>

        {legacyMembers.length > 0 && (
          <section className="trip-access-list" aria-label="Other trip members">
            <h3>Other people with access</h3>
            {legacyMembers.map((member) => (
              <div className="trip-access-row" key={member.userId}>
                <span>{member.email || member.userId}</span>
                <strong>{displayRole(member.role)}</strong>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === member.userId}
                  onClick={() => handleRemoveMember(member.userId)}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        )}
        {invites.some((invite) => invite.status === 'pending') && (
          <section className="trip-access-list" aria-label="Pending invitations">
            <h3>Pending invitations</h3>
            {invites.filter((invite) => invite.status === 'pending').map((invite) => (
              <div className="trip-access-row" key={invite.id}>
                <span>{invite.email} · {displayRole(invite.role)} · {getExpiryLabel(invite.expiresAt)}</span>
                <button
                  className="text-button"
                  type="button"
                  disabled={workingId === invite.id}
                  onClick={() => handleRevokeInvite(invite.id)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </section>
        )}
        <button className="save-button dialog-done" type="button" onClick={onClose}>Done</button>
      </section>
    </div>
  )
}

export default TripShareDialog
