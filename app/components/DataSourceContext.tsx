import React, { createContext, useState, useContext, ReactNode } from 'react';

// Define the type for the context value
type DataSourceContextType = {
  dataSource: 'garmin' | 'apple' | null;
  setDataSource: (source: 'garmin' | 'apple' | null) => void;
};

// Create the context with a default value
const DataSourceContext = createContext<DataSourceContextType>({
  dataSource: 'apple',
  setDataSource: () => {},
});

// Create a provider component
export const DataSourceProvider = ({ children }: { children: ReactNode }) => {
  const [dataSource, setDataSource] = useState<'garmin' | 'apple' | null>('apple');

  return (
    <DataSourceContext.Provider value={{ dataSource, setDataSource }}>
      {children}
    </DataSourceContext.Provider>
  );
};

// Create a custom hook to use the context
export const useDataSource = () => useContext(DataSourceContext); 