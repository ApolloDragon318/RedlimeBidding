import { useState, useRef, useEffect, useMemo } from 'react'

export default function SearchableCombo({
  label,
  options,
  value,
  onChange,
  placeholder,
  getLabel = (o) => o?.name ?? '',
  getValue = (o) => o?._id,
  disabled
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  const selected = options.find(o => String(getValue(o)) === String(value))

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = !ql ? options : options.filter(o => getLabel(o).toLowerCase().includes(ql))
    return list.slice(0, 80)
  }, [options, q, getLabel])

  useEffect(() => {
    const fn = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('click', fn)
    return () => document.removeEventListener('click', fn)
  }, [])

  return (
    <div className="search-combo" ref={ref}>
      {label && <label className="prof-field-label">{label}</label>}
      <div className="search-combo-inner">
        <input
          type="text"
          placeholder={placeholder}
          value={open ? q : (selected ? getLabel(selected) : '')}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQ(selected ? getLabel(selected) : '') }}
          disabled={disabled}
          className="search-combo-input"
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul className="search-combo-list" role="listbox">
            {filtered.map(o => (
              <li
                key={String(getValue(o))}
                role="option"
                className={String(getValue(o)) === String(value) ? 'active' : ''}
                onMouseDown={e => {
                  e.preventDefault()
                  onChange(getValue(o))
                  setOpen(false)
                  setQ('')
                }}
              >
                {getLabel(o)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
