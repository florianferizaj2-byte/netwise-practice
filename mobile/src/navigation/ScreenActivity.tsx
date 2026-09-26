import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

const ScreenActivity = createContext(true);

export function useAppActive() {
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

export function ScreenActivityProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <ScreenActivity.Provider value={active}>{children}</ScreenActivity.Provider>
  );
}

export function useScreenActive() {
  return useContext(ScreenActivity);
}
