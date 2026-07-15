import React, { createContext, useContext, useMemo, useState } from 'react';

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year || new Date().getFullYear(), (month || 1) - 1, day || 1);
}

function displayWorkDate(value, scope) {
  if (scope === 'month') {
    return parseDateKey(`${String(value || '').slice(0, 7)}-01`).toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    });
  }
  return parseDateKey(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const WorkDateContext = createContext(null);

export function WorkDateProvider({ children }) {
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [selectedScope, setSelectedScope] = useState('day');

  const value = useMemo(() => {
    const selectedMonth = selectedDate.slice(0, 7);
    const selectedLabel = displayWorkDate(selectedDate, selectedScope);
    return {
      selectedDate,
      selectedMonth,
      selectedScope,
      selectedLabel,
      setSelectedDate,
      setSelectedScope,
      selectDay(date) {
        setSelectedDate(date);
        setSelectedScope('day');
      },
      selectMonth(month) {
        if (!month) return;
        setSelectedDate(`${month}-01`);
        setSelectedScope('month');
      },
    };
  }, [selectedDate, selectedScope]);

  return (
    <WorkDateContext.Provider value={value}>
      {children}
    </WorkDateContext.Provider>
  );
}

export function useWorkDate() {
  const value = useContext(WorkDateContext);
  if (!value) {
    throw new Error('useWorkDate must be used within WorkDateProvider');
  }
  return value;
}

export { displayWorkDate, formatDateKey, parseDateKey };
