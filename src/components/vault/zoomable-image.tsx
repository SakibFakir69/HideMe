import { Image } from 'expo-image';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
/**
 * How long a second tap may take to still count as a double tap. The single
 * tap waits this long before it fires, so keep it short — the chrome toggle
 * should feel immediate.
 */
const DOUBLE_TAP_MAX_DELAY_MS = 250;
/**
 * How far the finger may travel and still count as a tap. The platform
 * default is unlimited, so a swipe would toggle the controls as well.
 */
const TAP_MAX_DISTANCE = 12;
/** How far the finger has to travel sideways before the photo pages. */
const SWIPE_THRESHOLD = 40;
/** How far sideways the finger has to travel before the swipe is tracked. */
const SWIPE_ACTIVATION = 12;
/** A mostly vertical drag must not page the gallery. */
const SWIPE_MAX_VERTICAL = 400;

export type SwipeDirection = 'next' | 'prev';

/** Clamp helper that can be called from a worklet. */
function clamp(value: number, min: number, max: number): number {
  'worklet';
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

interface ZoomableImageProps {
  uri: string;
  /** Fired on a single tap (a double tap zooms instead). */
  onTap: () => void;
  /**
   * Fired when the photo is swiped sideways. The gallery listens to this
   * instead of scrolling itself: a gesture handler inside the list swallows
   * the touch before the list can page, so the gesture drives the paging.
   */
  onSwipe?: (direction: SwipeDirection) => void;
  /** Screen-reader label for the photo. */
  accessibilityLabel: string;
}

/**
 * Full-screen photo with pinch-to-zoom, drag-to-pan and double-tap zoom.
 *
 * The image keeps its aspect ratio (`contain`), so the pan bounds are
 * derived from the intrinsic image size and the current scale — the photo
 * can never be dragged out of the viewport.
 */
export function ZoomableImage({
  uri,
  onTap,
  onSwipe,
  accessibilityLabel,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const containerW = useSharedValue(0);
  const containerH = useSharedValue(0);
  const imageW = useSharedValue(0);
  const imageH = useSharedValue(0);
  /**
   * Whether the photo is zoomed in. The pan gesture is only enabled then:
   * at 1× the finger has to be free for the swipe that pages to the next
   * photo.
   */
  const canPan = useSharedValue(false);
  /** The mirror of `canPan`: the swipe only runs while the photo is not zoomed. */
  const canSwipe = useSharedValue(true);

  // Rendered size of the photo inside the container (`contentFit="contain"`).
  const displayedWidth = useDerivedValue(() => {
    const cw = containerW.value;
    const ch = containerH.value;
    if (cw <= 0 || ch <= 0 || imageW.value <= 0 || imageH.value <= 0) return cw;
    const ratio = imageW.value / imageH.value;
    return ratio > cw / ch ? cw : ch * ratio;
  });

  const displayedHeight = useDerivedValue(() => {
    const cw = containerW.value;
    const ch = containerH.value;
    if (cw <= 0 || ch <= 0 || imageW.value <= 0 || imageH.value <= 0) return ch;
    const ratio = imageW.value / imageH.value;
    return ratio > cw / ch ? cw / ratio : ch;
  });

  // How far the photo may travel before its edge reaches the viewport edge.
  const maxX = useDerivedValue(() =>
    Math.max(0, (displayedWidth.value * scale.value - containerW.value) / 2),
  );
  const maxY = useDerivedValue(() =>
    Math.max(0, (displayedHeight.value * scale.value - containerH.value) / 2),
  );

  const pinch = usePinchGesture({
    onUpdate: (event) => {
      const next = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
      scale.value = next;
      const zoomed = next > 1.01;
      canPan.value = zoomed;
      canSwipe.value = !zoomed;
    },
    onDeactivate: () => {
      if (scale.value <= 1.01) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
        canPan.value = false;
        canSwipe.value = true;
        return;
      }
      savedScale.value = scale.value;
      translateX.value = clamp(translateX.value, -maxX.value, maxX.value);
      translateY.value = clamp(translateY.value, -maxY.value, maxY.value);
      savedX.value = translateX.value;
      savedY.value = translateY.value;
      canPan.value = true;
      canSwipe.value = false;
    },
  });

  const pan = usePanGesture({
    minDistance: 4,
    // One finger only: a two-finger drag belongs to the pinch gesture.
    maxPointers: 1,
    // Only a zoomed photo is panned.
    enabled: canPan,
    onUpdate: (event) => {
      translateX.value = clamp(savedX.value + event.translationX, -maxX.value, maxX.value);
      translateY.value = clamp(savedY.value + event.translationY, -maxY.value, maxY.value);
    },
    onDeactivate: () => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    },
  });

  /**
   * The sideways swipe that pages to the neighbouring photo. It lives here
   * because a gesture handler inside the list takes the touch before the
   * list can scroll — so the gesture reports the swipe and the gallery moves
   * the list itself.
   */
  const swipe = usePanGesture({
    enabled: canSwipe,
    maxPointers: 1,
    // Activate on a sideways drag, and give up on a mostly vertical one.
    activeOffsetX: [-SWIPE_ACTIVATION, SWIPE_ACTIVATION],
    activeOffsetY: [-SWIPE_MAX_VERTICAL, SWIPE_MAX_VERTICAL],
    onDeactivate: (event) => {
      const dx = event.translationX;
      if (Math.abs(dx) < SWIPE_THRESHOLD || !onSwipe) return;
      scheduleOnRN(onSwipe, dx < 0 ? 'next' : 'prev');
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDelay: DOUBLE_TAP_MAX_DELAY_MS,
    maxDistance: TAP_MAX_DISTANCE,
    onActivate: () => {
      const next = scale.value > 1 ? 1 : DOUBLE_TAP_SCALE;
      scale.value = withTiming(next);
      savedScale.value = next;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedX.value = 0;
      savedY.value = 0;
      const zoomed = next > 1.01;
      canPan.value = zoomed;
      canSwipe.value = !zoomed;
    },
  });

  const singleTap = useTapGesture({
    numberOfTaps: 1,
    maxDistance: TAP_MAX_DISTANCE,
    onActivate: () => {
      scheduleOnRN(onTap);
    },
  });

  const gesture = useSimultaneousGestures(
    pinch,
    pan,
    swipe,
    useExclusiveGestures(doubleTap, singleTap),
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    containerW.value = event.nativeEvent.layout.width;
    containerH.value = event.nativeEvent.layout.height;
  };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[StyleSheet.absoluteFill, animatedStyle]}
        onLayout={onLayout}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}>
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={180}
          onLoad={(event) => {
            imageW.value = event.source.width;
            imageH.value = event.source.height;
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}
