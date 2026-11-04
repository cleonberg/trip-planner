import { useState } from 'react'

function DurationInput({ value, maxMinutes, onChange }) {
  const initialMinutes = Number(value) || 0
  const [hours, setHours] = useState(String(Math.floor(initialMinutes / 60)))
  const [minutes, setMinutes] = useState(String(initialMinutes % 60))
  const maxHours = Math.floor(maxMinutes / 60)
  const currentHours = Number(hours) || 0
  const maxRemainder = currentHours >= maxHours ? maxMinutes % 60 : 59

  function updateDuration(nextHours, nextMinutes) {
    if (nextHours === '' || nextMinutes === '') return
    onChange(String(Number(nextHours) * 60 + Number(nextMinutes)))
  }

  return (
    <fieldset className="duration-input">
      <legend>Duration</legend>
      <label>
        <span>Hours</span>
        <input
          required
          type="number"
          min="0"
          max={maxHours}
          step="1"
          value={hours}
          onChange={(event) => {
            setHours(event.target.value)
            updateDuration(event.target.value, minutes)
          }}
        />
      </label>
      <label>
        <span>Minutes</span>
        <input
          required
          type="number"
          min={currentHours === 0 ? 15 : 0}
          max={maxRemainder}
          step="15"
          value={minutes}
          onChange={(event) => {
            setMinutes(event.target.value)
            updateDuration(hours, event.target.value)
          }}
        />
      </label>
    </fieldset>
  )
}

export default DurationInput
