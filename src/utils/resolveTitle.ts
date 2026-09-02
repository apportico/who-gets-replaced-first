// R7. A free-text job title resolves to one of the nine ISCO-08 major groups.
//
// A pure function rather than a branch inside the screen, so R19 can assert it
// directly. That is also what settles where the resolution table lives: here,
// once, rather than inline in JSX where nothing could test it.
//
// The one rule worth stating: **an unresolvable title returns null, and the
// screen says so.** An earlier draft defaulted to group 4, which is how a
// person who typed something the table has never seen gets told a confident
// story about clerical workers. Guessing the group is the same failure as
// guessing a number — it just looks less like one.

// Ordered, and the order is the whole design. The first matching entry wins, so
// the specific sits above the general: "paralegal" must reach group 3 before
// "legal" could pull it anywhere else, and "data entry" must reach group 4
// before "data" reaches group 2. Adding a keyword to the wrong end of this list
// is the likeliest way to break it.
const LOOKUP: readonly (readonly [number, readonly string[]])[] = [
  [3, ['paralegal', 'dental hygien', 'nurse', 'paramedic', 'technician', 'draft',
       'inspector', 'estimator', 'surveyor', 'broker', 'agent', 'supervisor',
       'coordinator']],
  [4, ['clerk', 'clerical', 'bookkeep', 'admin', 'secretar', 'data entry',
       'receptionist', 'payroll', 'filing', 'office assistant', 'typist',
       'scheduler']],
  [2, ['engineer', 'developer', 'programmer', 'lawyer', 'doctor', 'physician',
       'teacher', 'professor', 'accountant', 'architect', 'scientist', 'analyst',
       'designer', 'researcher', 'pharmacist', 'journalist', 'writer',
       'economist']],
  [1, ['manager', 'director', 'head of', 'chief', 'executive', 'ceo', 'cto',
       'founder', 'partner', 'principal']],
  [5, ['sales', 'cashier', 'waiter', 'waitress', 'barista', 'retail', 'chef',
       'cook', 'hairdress', 'security guard', 'care worker', 'bartender',
       'flight attendant', 'shop']],
  [6, ['farmer', 'fisher', 'forest', 'agricultur', 'grower', 'herder']],
  [7, ['electrician', 'plumber', 'carpenter', 'welder', 'mechanic', 'mason',
       'tailor', 'baker', 'machinist', 'builder', 'painter']],
  [8, ['driver', 'operator', 'assembler', 'truck', 'forklift', 'crane', 'pilot',
       'conductor', 'courier']],
  [9, ['cleaner', 'labourer', 'laborer', 'porter', 'dishwash', 'packer',
       'janitor', 'helper', 'delivery']],
]

/**
 * @returns {number|null} the ISCO-08 major group, or null when nothing matches.
 */
export function resolveTitle(raw: string | null | undefined) {
  const t = (raw ?? '').toLowerCase().trim()
  if (!t) return null
  for (const [code, keywords] of LOOKUP) {
    for (const k of keywords) {
      if (t.includes(k)) return code
    }
  }
  return null
}
