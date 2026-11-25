import { CameraView } from 'expo-camera';
import { useEffect, useRef, type RefObject } from 'react';
import { StyleSheet } from 'react-native';

/**
 * A front camera the user cannot see or hear. Mounted by the gate ONLY while
 * intruder selfies are armed; captures happen on verified wrong codes via the
 * shared ref, and the photo goes straight to the encrypted capture store.
 */
export type IntruderCaptureFn = () => Promise<string | null>;

interface IntruderCameraProps {
  /** Filled with a silent-capture function once mounted. */
  captureRef: RefObject<IntruderCaptureFn | null>;
}

export function IntruderCamera({ captureRef }: IntruderCameraProps) {
  const cameraRef = useRef<CameraView | null>(null);
  const capturingRef = useRef(false);

  useEffect(() => {
    captureRef.current = async () => {
      const camera = cameraRef.current;
      if (!camera || capturingRef.current) return null;
      capturingRef.current = true;
      try {
        const photo = await camera.takePictureAsync({
          quality: 0.6,
          skipProcessing: true,
          shutterSound: false,
        });
        return photo?.uri ?? null;
      } catch {
        // camera unavailable (permission revoked, hardware busy) → no capture
        return null;
      } finally {
        capturingRef.current = false;
      }
    };
    return () => {
      captureRef.current = null;
    };
  }, [captureRef]);

  // 1×1 at 1% opacity: never renders as a visible surface, but Android still
  // drives the preview texture so takePictureAsync has frames to draw from.
  return (
    <CameraView
      ref={cameraRef}
      style={styles.hidden}
      facing="front"
      animateShutter={false}
    />
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
  },
});
