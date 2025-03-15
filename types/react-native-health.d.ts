declare module 'react-native-health' {
  interface HealthValue {
    value: number;
    startDate: string;
    endDate: string;
  }

  interface HealthKitPermissions {
    permissions: {
      read: string[];
      write: string[];
    };
  }

  interface AppleHealthKit {
    Constants: {
      Permissions: {
        HeartRateVariability: string;
        HeartRate: string;
        Steps: string;
      };
    };
    initHealthKit: (permissions: HealthKitPermissions, callback: (error: string) => void) => void;
    getHeartRateVariabilitySamples: (options: any, callback: (error: string, results: HealthValue[]) => void) => void;
  }

  const healthKit: AppleHealthKit;
  export default healthKit;
} 