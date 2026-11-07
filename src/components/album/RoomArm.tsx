import { useEffect, useRef, useState } from 'react';
import type { ArmPose, ArmRegion, Tonearm } from '@/lib/tonearm';
import type { ReleaseRoom } from '@/lib/releaseRooms';

interface RoomArmProps {
  room: ReleaseRoom;
  /** The room photo's box, in the container's px. */
  img: { left: number; top: number; width: number; height: number };
  /** Down on the record, or parked on its rest. */
  down: boolean;
  /** Called once the arm has finished moving to `down`. */
  onSettled?: (down: boolean) => void;
}

// Timings of the cue and the swing, ms.
const LIFT_MS = 380;
const SWING_MS = 950;
const LOWER_MS = 650;
/** Before it cues in: lets a room or a record crossfade in first. */
const CUE_DELAY_MS = 500;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** The cue lowering: quick, then a soft settle. */
const easeSettle = (t: number) => 1 - Math.pow(1 - t, 3) * Math.cos(t * 2.2);

/**
 * The release room's tonearm, in 3D over a photo that has only the arm's base
 * (rooms with `arm` in src/config/release-rooms.json). Moving between down and
 * parked, it lifts on the cue, swings, and lowers. It draws only while moving,
 * and loads three.js on first use. Without WebGL it draws nothing.
 */
export function RoomArm({ room, img, down, onSettled }: RoomArmProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [arm, setArm] = useState<Tonearm | null>(null);
  const pose = useRef<ArmPose | null>(null);
  const settled = useRef(onSettled);
  settled.current = onSettled;

  useEffect(() => {
    let live = true;
    let made: Tonearm | null = null;
    import('@/lib/tonearm')
      .then(({ createTonearm }) => {
        if (!live || !canvas.current) return;
        made = createTonearm(canvas.current, room);
        setArm(made);
      })
      .catch(() => {});
    return () => {
      live = false;
      made?.dispose();
    };
  }, [room]);

  // The canvas follows the photo's size.
  const width = arm ? (arm.region.width / 100) * img.width : 0;
  useEffect(() => {
    if (arm && width > 0) arm.resize(width);
  }, [arm, width]);

  // Move to down / parked.
  useEffect(() => {
    if (!arm) return;
    const from = pose.current ?? arm.rest;
    const goal = down ? arm.play : arm.rest;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || (from.yaw === goal.yaw && from.lift === goal.lift)) {
      pose.current = goal;
      arm.draw(goal);
      settled.current?.(down);
      return;
    }
    // Lift, swing, lower; each from wherever the last move left the arm.
    const steps: { ms: number; to: Partial<ArmPose>; ease?: (t: number) => number }[] = [
      ...(down ? [{ ms: CUE_DELAY_MS, to: {} }] : []),
      { ms: LIFT_MS, to: { lift: 1 } },
      { ms: SWING_MS, to: { yaw: goal.yaw } },
      { ms: LOWER_MS, to: { lift: goal.lift }, ease: easeSettle },
    ];
    let frame = 0;
    let step = 0;
    let start = performance.now();
    let at = { ...from };
    const tick = (now: number) => {
      const s = steps[step];
      const t = Math.min(1, (now - start) / s.ms);
      const e = (s.ease ?? easeInOut)(t);
      const p = {
        yaw: s.to.yaw === undefined ? at.yaw : at.yaw + (s.to.yaw - at.yaw) * e,
        lift: s.to.lift === undefined ? at.lift : at.lift + (s.to.lift - at.lift) * e,
      };
      pose.current = p;
      arm.draw(p);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else if (++step < steps.length) {
        at = { ...p };
        start = now;
        frame = requestAnimationFrame(tick);
      } else {
        settled.current?.(down);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [arm, down]);

  const r: ArmRegion | undefined = arm?.region;
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="release-room-arm"
      style={
        r
          ? {
              left: img.left + (r.left / 100) * img.width,
              top: img.top + (r.top / 100) * img.height,
              width: (r.width / 100) * img.width,
              height: (r.height / 100) * img.height,
            }
          : { display: 'none' }
      }
    />
  );
}
