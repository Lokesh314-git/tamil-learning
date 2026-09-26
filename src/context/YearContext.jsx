import React, { createContext, useContext, useEffect, useState } from 'react';

const YearContext = createContext();

export const YearProvider = ({ children }) => {
  const [selectedYear, setSelectedYear] = useState(() => localStorage.getItem('selectedYear'));

  useEffect(() => {
    if (selectedYear) localStorage.setItem('selectedYear', selectedYear);
    else localStorage.removeItem('selectedYear');
  }, [selectedYear]);

  return (
    <YearContext.Provider value={{ selectedYear, setSelectedYear }}>
      {children}
    </YearContext.Provider>
  );
};

export const useYear = () => useContext(YearContext);
