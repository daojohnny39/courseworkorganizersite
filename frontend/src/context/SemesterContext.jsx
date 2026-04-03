import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getSemesters, addSemester as apiAdd, deleteSemester as apiDelete } from '../api';
import { useAuth } from './AuthContext';

const SemesterContext = createContext(null);

export function SemesterProvider({ children }) {
  const { isAuthenticated } = useAuth();

  // The list of semesters the user has added
  const [semesters, setSemesters] = useState([]);
  const [semestersLoading, setSemestersLoading] = useState(false);

  // The currently selected semester (persisted to localStorage)
  const [selected, setSelected] = useState(() => {
    try {
      const stored = localStorage.getItem('coursetrack_semester');
      if (stored) return JSON.parse(stored);
    } catch {}
    return null; // null = nothing selected yet
  });

  // Load user's semesters whenever they are logged in
  const loadSemesters = useCallback(() => {
    if (!isAuthenticated) return;
    setSemestersLoading(true);
    getSemesters()
      .then(({ data }) => {
        setSemesters(data);
        // If the stored selection isn't in the list anymore, reset to the first one
        setSelected(prev => {
          if (!prev) return data[0] ?? null;
          const still = data.find(s => s.semester === prev.semester && s.year === prev.year);
          return still ?? data[0] ?? null;
        });
      })
      .catch(() => {})
      .finally(() => setSemestersLoading(false));
  }, [isAuthenticated]);

  useEffect(() => { loadSemesters(); }, [loadSemesters]);

  // Persist selected semester to localStorage whenever it changes
  useEffect(() => {
    if (selected) {
      localStorage.setItem('coursetrack_semester', JSON.stringify(selected));
    }
  }, [selected]);

  const selectSemester = (semObj) => setSelected(semObj);

  const addSemester = async (semester, year) => {
    const { data } = await apiAdd({ semester, year });
    setSemesters(prev => {
      // Insert in sorted order (newest year / fall-first)
      const next = [...prev, data].sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        const order = { Fall: 1, Summer: 2, Spring: 3, Winter: 4 };
        return (order[a.semester] ?? 5) - (order[b.semester] ?? 5);
      });
      return next;
    });
    setSelected(data); // auto-select the newly added semester
    return data;
  };

  const removeSemester = async (id) => {
    await apiDelete(id);
    setSemesters(prev => {
      const next = prev.filter(s => s.id !== id);
      // If we deleted the currently selected one, switch to first available
      setSelected(cur => {
        if (cur?.id === id) return next[0] ?? null;
        return cur;
      });
      return next;
    });
  };

  return (
    <SemesterContext.Provider value={{
      semesters,
      semestersLoading,
      selected,
      // Flatten selected for easy consumption by pages
      semester: selected?.semester ?? null,
      year: selected?.year ?? null,
      selectSemester,
      addSemester,
      removeSemester,
      reloadSemesters: loadSemesters,
    }}>
      {children}
    </SemesterContext.Provider>
  );
}

export function useSemester() {
  return useContext(SemesterContext);
}
