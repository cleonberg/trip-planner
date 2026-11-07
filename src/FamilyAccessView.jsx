import { useEffect, useState } from 'react'
import { createFamilyMember, loadFamilyMembers } from './plannerStore.js'
import { deleteFamilyMember, setFamilyTripAccess } from './tripInvites.js'

function toggleSelection(values, value) {
  return values.includes(value)
    ? values.filter((currentValue) => currentValue !== value)
    : [...values, value]
}

function FamilyAccessView({ user, trips }) {
  const [familyMembers, setFamilyMembers] = useState([])
  const [selectedMemberIds, setSelectedMemberIds] = useState([])
  const [selectedTripIds, setSelectedTripIds] = useState([])
  const [role, setRole] = useState('viewer')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    loadFamilyMembers(user.uid)
      .then((members) => {
        if (active) setFamilyMembers(members)
      })
      .catch((loadError) => {
        if (!active) return
        console.error('Unable to load family members.', loadError)
        setError(loadError.message)
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [user.uid])

  async function handleAddFamilyMember(event) {
    event.preventDefault()
    setIsAdding(true)
    setError('')
    setSuccess('')
    try {
      if (familyMembers.some((member) => member.email?.toLowerCase() === email.trim().toLowerCase())) {
        throw new Error('That email is already in your family list.')
      }
      const member = await createFamilyMember(user.uid, { name, email })
      setFamilyMembers((currentMembers) => [...currentMembers, member])
      setSelectedMemberIds((currentIds) => [...currentIds, member.id])
      setName('')
      setEmail('')
      setSuccess(`${member.name} was added. Select trips below to set their access.`)
    } catch (addError) {
      console.error('Unable to add family member.', addError)
      setError(addError.message)
    } finally {
      setIsAdding(false)
    }
  }

  async function handleApplyAccess(event) {
    event.preventDefault()
    setIsApplying(true)
    setError('')
    setSuccess('')
    try {
      const results = await Promise.allSettled(selectedMemberIds.map((memberId) => (
        setFamilyTripAccess({ memberId, tripIds: selectedTripIds, role })
      )))
      const updates = results.flatMap((result, index) => (
        result.status === 'fulfilled'
          ? [{ memberId: selectedMemberIds[index], pending: result.value.pending }]
          : []
      ))
      const failures = results.flatMap((result, index) => (
        result.status === 'rejected'
          ? [`${familyMembers.find((member) => member.id === selectedMemberIds[index])?.name ?? 'Family member'}: ${result.reason.message}`]
          : []
      ))

      setFamilyMembers((currentMembers) => currentMembers.map((member) => {
        const update = updates.find((item) => item.memberId === member.id)
        if (!update) return member
        const access = { ...member.access }
        const pendingAccess = { ...member.pendingAccess }
        selectedTripIds.forEach((tripId) => {
          if (role === 'none') {
            delete access[tripId]
            delete pendingAccess[tripId]
          } else {
            access[tripId] = role
            if (update.pending) pendingAccess[tripId] = true
            else delete pendingAccess[tripId]
          }
        })
        return { ...member, access, pendingAccess }
      }))

      if (failures.length > 0) {
        setError(`Some access changes could not be applied: ${failures.join('; ')}`)
      }
      if (updates.length > 0) {
        const pendingCount = updates.filter((update) => update.pending).length
        setSuccess(
          `Updated ${updates.length} ${updates.length === 1 ? 'person' : 'people'} across ${selectedTripIds.length} ${selectedTripIds.length === 1 ? 'trip' : 'trips'}.`
          + (role !== 'none' && pendingCount > 0 ? ` ${pendingCount} will get access after signing in with their verified email.` : ''),
        )
      }
    } catch (applyError) {
      console.error('Unable to apply bulk family trip access.', applyError)
      setError(applyError.message)
    } finally {
      setIsApplying(false)
    }
  }

  async function handleRemoveFamilyMember(memberId) {
    setWorkingId(memberId)
    setError('')
    setSuccess('')
    try {
      await deleteFamilyMember({ memberId })
      setFamilyMembers((currentMembers) => currentMembers.filter((member) => member.id !== memberId))
      setSelectedMemberIds((currentIds) => currentIds.filter((currentId) => currentId !== memberId))
    } catch (removeError) {
      console.error('Unable to remove family member.', removeError)
      setError(removeError.message)
    } finally {
      setWorkingId('')
    }
  }

  const allMembersSelected = familyMembers.length > 0 && selectedMemberIds.length === familyMembers.length
  const allTripsSelected = trips.length > 0 && selectedTripIds.length === trips.length

  return (
    <div className="page-wrap family-access-page">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Together</p>
          <h1>Family access</h1>
          <p>Add family members once, then set the same access across multiple people and trips.</p>
        </div>
      </section>

      <section className="family-access-panel">
        <h2>Add a family member</h2>
        <form className="family-add-form" onSubmit={handleAddFamilyMember}>
          <label className="form-field">
            <span>Name</span>
            <input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="form-field">
            <span>Email address</span>
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <button className="primary-button" type="submit" disabled={isAdding}>
            {isAdding ? 'Adding…' : 'Add to family list'}
          </button>
        </form>
      </section>

      <form className="family-access-panel family-bulk-form" onSubmit={handleApplyAccess}>
        <div className="family-bulk-heading">
          <div>
            <h2>Apply access in bulk</h2>
            <p>Choose one or more family members and up to 50 trips, then apply one access level to all selections.</p>
          </div>
          <label className="form-field">
            <span>Access</span>
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="none">None</option>
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
            </select>
          </label>
        </div>

        <div className="family-bulk-columns">
          <fieldset>
            <legend>Family members</legend>
            <button
              className="text-button family-select-all"
              type="button"
              disabled={familyMembers.length === 0}
              onClick={() => setSelectedMemberIds(allMembersSelected ? [] : familyMembers.map((member) => member.id))}
            >
              {allMembersSelected ? 'Clear selection' : 'Select all'}
            </button>
            {isLoading
              ? <p>Loading family list…</p>
              : familyMembers.length > 0
                ? familyMembers.map((member) => (
                  <label className="family-selection-option" key={member.id}>
                    <input
                      type="checkbox"
                      checked={selectedMemberIds.includes(member.id)}
                      onChange={() => setSelectedMemberIds((currentIds) => toggleSelection(currentIds, member.id))}
                    />
                    <span><strong>{member.name}</strong><small>{member.email}</small></span>
                  </label>
                ))
                : <p>Add family members above to get started.</p>}
          </fieldset>

          <fieldset>
            <legend>Trips</legend>
            <button
              className="text-button family-select-all"
              type="button"
              disabled={trips.length === 0}
              onClick={() => setSelectedTripIds(allTripsSelected ? [] : trips.map((trip) => trip.id))}
            >
              {allTripsSelected ? 'Clear selection' : 'Select all'}
            </button>
            {trips.length > 0
              ? trips.map((trip) => (
                <label className="family-selection-option" key={trip.id}>
                  <input
                    type="checkbox"
                    checked={selectedTripIds.includes(trip.id)}
                    onChange={() => setSelectedTripIds((currentIds) => toggleSelection(currentIds, trip.id))}
                  />
                  <span><strong>{trip.name}</strong><small>{trip.year}</small></span>
                </label>
              ))
              : <p>Add trips before assigning access.</p>}
          </fieldset>
        </div>

        <div className="family-bulk-submit">
          <p>{selectedMemberIds.length} people · {selectedTripIds.length} trips selected</p>
          <button className="primary-button" type="submit" disabled={
            isApplying || selectedMemberIds.length === 0 || selectedTripIds.length === 0 || selectedTripIds.length > 50
          }>
            {isApplying ? 'Applying access…' : 'Apply to selected'}
          </button>
        </div>
      </form>

      {error && <p className="trip-invite-error" role="alert">{error}</p>}
      {success && <p className="family-access-success" role="status">{success}</p>}

      <section className="family-access-panel">
        <h2>Family list</h2>
        {isLoading
          ? <p>Loading family list…</p>
          : familyMembers.length > 0
            ? <div className="family-member-list">
              {familyMembers.map((member) => {
                const assignedTrips = trips.filter((trip) => member.access?.[trip.id])
                return (
                  <article className="family-member-card" key={member.id}>
                    <div>
                      <h3>{member.name}</h3>
                      <p>{member.email}</p>
                      <small>
                        {assignedTrips.length > 0
                          ? assignedTrips.map((trip) => `${trip.name} · ${member.access[trip.id]}`).join('  ·  ')
                          : 'No trip access assigned'}
                      </small>
                    </div>
                    <button
                      className="text-button"
                      type="button"
                      disabled={workingId === member.id}
                      onClick={() => handleRemoveFamilyMember(member.id)}
                    >
                      {workingId === member.id ? 'Removing…' : 'Remove'}
                    </button>
                  </article>
                )
              })}
            </div>
            : <p>No family members saved yet.</p>}
      </section>
    </div>
  )
}

export default FamilyAccessView
