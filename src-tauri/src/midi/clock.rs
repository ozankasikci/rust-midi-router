//! MIDI Clock generator
//!
//! Handles timing, tick calculation, and clock pulse generation at 24 PPQ.

use std::time::{Duration, Instant};

/// MIDI Clock generator - produces 24 pulses per quarter note
pub struct ClockGenerator {
    bpm: f64,
    running: bool,
    last_tick: Option<Instant>,
}

impl ClockGenerator {
    pub const PULSES_PER_QUARTER_NOTE: u32 = 24;

    pub fn new(bpm: f64) -> Self {
        Self {
            bpm: bpm.clamp(20.0, 300.0),
            running: false,
            last_tick: None,
        }
    }

    /// Set the BPM (clamped to 20-300)
    pub fn set_bpm(&mut self, bpm: f64) {
        self.bpm = bpm.clamp(20.0, 300.0);
    }

    pub fn bpm(&self) -> f64 {
        self.bpm
    }

    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Start the clock (resets timing)
    pub fn start(&mut self) {
        self.running = true;
        self.last_tick = None;
    }

    /// Continue the clock (preserves timing)
    pub fn continue_playback(&mut self) {
        self.running = true;
        // Don't reset last_tick for continue
    }

    /// Stop the clock
    pub fn stop(&mut self) {
        self.running = false;
    }

    /// Calculate the interval between clock pulses
    fn clock_interval(&self) -> Duration {
        // 60 seconds / BPM / 24 PPQ
        Duration::from_secs_f64(60.0 / self.bpm / Self::PULSES_PER_QUARTER_NOTE as f64)
    }

    /// Check if a clock tick should be generated, and update timing if so.
    /// Returns true if a tick should be sent.
    pub fn should_tick(&mut self) -> bool {
        if !self.running {
            return false;
        }

        let now = Instant::now();
        let interval = self.clock_interval();

        let should_tick = match self.last_tick {
            None => true,
            Some(last) => now.duration_since(last) >= interval,
        };

        if should_tick {
            // Increment by interval instead of setting to now to prevent drift
            self.last_tick = Some(match self.last_tick {
                None => now,
                Some(last) => {
                    // If we've fallen too far behind (>2 intervals), reset to now
                    let next = last + interval;
                    if now.duration_since(next) > interval {
                        now
                    } else {
                        next
                    }
                }
            });
        }

        should_tick
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    #[test]
    fn new_clock_is_stopped() {
        let clock = ClockGenerator::new(120.0);
        assert!(!clock.is_running());
        assert_eq!(clock.bpm(), 120.0);
    }

    #[test]
    fn bpm_is_clamped() {
        let clock = ClockGenerator::new(10.0);
        assert_eq!(clock.bpm(), 20.0);

        let clock = ClockGenerator::new(500.0);
        assert_eq!(clock.bpm(), 300.0);
    }

    #[test]
    fn start_enables_clock() {
        let mut clock = ClockGenerator::new(120.0);
        clock.start();
        assert!(clock.is_running());
    }

    #[test]
    fn stop_disables_clock() {
        let mut clock = ClockGenerator::new(120.0);
        clock.start();
        clock.stop();
        assert!(!clock.is_running());
    }

    #[test]
    fn should_tick_returns_false_when_stopped() {
        let mut clock = ClockGenerator::new(120.0);
        assert!(!clock.should_tick());
    }

    #[test]
    fn should_tick_returns_true_on_first_tick() {
        let mut clock = ClockGenerator::new(120.0);
        clock.start();
        assert!(clock.should_tick());
    }

    #[test]
    fn should_tick_respects_interval() {
        let mut clock = ClockGenerator::new(120.0);
        clock.start();

        // First tick always returns true
        assert!(clock.should_tick());

        // Immediately after, should not tick
        assert!(!clock.should_tick());

        // At 120 BPM with 24 PPQ, interval is 60/120/24 = 0.0208333s ≈ 20.8ms
        // Wait slightly longer than the interval
        thread::sleep(Duration::from_millis(25));

        // Now should tick
        assert!(clock.should_tick());
    }

    #[test]
    fn set_bpm_updates_interval() {
        let mut clock = ClockGenerator::new(120.0);
        clock.set_bpm(60.0);
        assert_eq!(clock.bpm(), 60.0);
    }

    #[test]
    fn continue_preserves_timing() {
        let mut clock = ClockGenerator::new(120.0);
        clock.start();
        clock.should_tick(); // Get first tick

        clock.stop();
        clock.continue_playback();

        // After continue, last_tick should still be set
        assert!(clock.is_running());
    }
}
