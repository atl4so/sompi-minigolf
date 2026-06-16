import { Suspense, lazy } from 'react';
import { useLocation } from 'wouter';
import './styles/styles.scss';
import ClassicJavaClient from './views/ClassicJavaClient';
import LoadingScreen from './views/LoadingScreen';

const WebApp = lazy(() => import('./views/WebApp'));

function App() {
  const [location] = useLocation();
  const classicPath = location === '/' || location === '/classic';

  if (classicPath) {
    return <ClassicJavaClient />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <WebApp />
    </Suspense>
  );
}

export default App;
