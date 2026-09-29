import { useAppServices } from '../services.tsx';

export function useIsOffline() {
  const services = useAppServices();
  return () => services.platform.network.isOffline();
}

export function useCopyText() {
  const { platform } = useAppServices();
  return (text: string) => platform.clipboard.writeText(text);
}
