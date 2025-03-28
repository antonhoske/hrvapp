export interface GarminData {
  stress: {
    max_stress: number;
    avg_stress: number;
    date: string;
  } | null;
  hrv: {
    summary: {
      lastNightAvg: number;
      lastNight5MinHigh: number;
      status: string;
      feedbackPhrase: string;
    };
    readings: {
      time: string;
      value: number;
    }[];
  } | null;
  sleep: {
    summary: {
      total_sleep_seconds: number;
      deep_sleep_seconds: number;
      light_sleep_seconds: number;
      rem_sleep_seconds: number;
      awake_seconds: number;
      sleep_start: string;
      sleep_end: string;
      sleep_score: string;
      average_hrv: number;
      lowest_hrv: number;
      highest_hrv: number;
    };
    phases: {
      start_time: string;
      end_time: string;
      phase_type: string;
      duration_seconds: number;
      hrv: number;
    }[];
  } | null;
  activity: {
    steps: number;
    calories_burned: number;
    active_minutes: number;
    distance_km: number;
    floors_climbed: number;
    active_time_seconds: number;
    date: string;
    vo2_max: number;
    vo2_max_status: string;
    vo2_max_date: string;
    daily_activities: { type: string; duration_minutes: number }[];
    mindful_minutes: number;
  } | null;
  heart_rate: {
    resting_heart_rate: number;
    hrv_heart_rate: number;
    date: string;
  } | null;
} 