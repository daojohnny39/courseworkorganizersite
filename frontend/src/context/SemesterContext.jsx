import { createContext, useContext, useState } from 'react';

const SemesterContext = createContext(null);

const DEFAULT = { semester: 'Spring', year: 2026 };

export function SemesterProvider({ children }) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem('coursetrack_semester');
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT;
  });

  const setSemester = (newVal) => {
    setValue(newVal);
    try {
      localStorage.setItem('coursetrack_semester', JSON.stringify(newVal));
    } catch {}
  };

  return (
    <SemesterContext.Provider value={{ ...value, setSemester }}>
      {children}
    </SemesterContext.Provider>
  );
}

export function useSemester() {
  return useContext(SemesterContext);
}

// Generate a list of semester options spanning several years
export function getSemesterOptions() {
  const seasons = ['Spring', 'Summer', 'Fall', 'Winter'];
  const options = [];
  for (let y = 2020; y <= 2030; y++) {
    for (const s of seasons) {
      options.push({ semester: s, year: y, label: `${s} ${y}` });
    }
  }
  return options;
}
