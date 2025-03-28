import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from garminconnect import Garmin
import logging
from functools import wraps
from datetime import datetime, timedelta
import json
import pprint
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Helper function to pretty print API responses
def log_api_response(name, data):
    """Log API response in a readable format"""
    try:
        if data:
            logger.info(f"=== {name} API RESPONSE ===")
            formatted = pprint.pformat(data, indent=2)
            # Split by lines to keep logs readable
            for line in formatted.split('\n'):
                logger.info(line)
            logger.info(f"=== END {name} API RESPONSE ===")
        else:
            logger.warning(f"{name} API returned no data")
    except Exception as e:
        logger.error(f"Error logging {name} API response: {e}")

app = Flask(__name__)
CORS(app)

# Dictionary to cache Garmin client instances
client_cache = {}

def get_client(email, password):
    """Get or create a cached Garmin client instance"""
    cache_key = f"{email}:{password}"
    
    if cache_key in client_cache:
        client = client_cache[cache_key]
        try:
            test_date = datetime.now().strftime("%Y-%m-%d")
            logger.info(f"Testing cached session for {email} with date {test_date}")
            client.get_user_summary(cdate=test_date)
            logger.info(f"✓ Using cached session for {email}")
            return client
        except Exception as e:
            logger.info(f"✗ Cached session expired, creating new login: {e}")
    
    try:
        logger.info(f"Creating new Garmin client for {email}")
        start_time = time.time()
        client = Garmin(email, password)
        logger.info(f"Attempting login for {email}")
        client.login()
        elapsed = time.time() - start_time
        logger.info(f"✓ Login successful for {email} (took {elapsed:.2f}s)")
        client_cache[cache_key] = client
        return client
    except Exception as e:
        logger.error(f"✗ Login failed for {email}: {e}")
        raise Exception("Authentication failed. Please check your credentials.")

def require_auth(f):
    """Decorator to handle authentication for routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        data = request.get_json()
        if not data:
            logger.error("No data provided in request")
            return jsonify({"error": "No data provided"}), 400
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            logger.error("Missing email or password in request")
            return jsonify({"error": "Email and password required"}), 400
        
        try:
            logger.info(f"Authenticating request for {email}")
            request.garmin_client = get_client(email, password)
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return jsonify({"error": str(e)}), 401
    
    return decorated

@app.route("/login", methods=["POST"])
@require_auth
def garmin_login():
    logger.info("Successful login request")
    return jsonify({"status": "success"}), 200

@app.route("/all_data", methods=["POST"])
@require_auth
def get_all_data():
    try:
        data = request.get_json()
        
        # Handle date parameter with proper defaulting
        target_date = data.get('date')
        use_yesterday = data.get('use_yesterday', False)
        
        # If no date provided, use today's date or yesterday based on parameter
        if not target_date:
            if use_yesterday:
                target_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
                logger.info(f"No date provided, using yesterday's date: {target_date}")
            else:
                target_date = datetime.now().strftime("%Y-%m-%d")
                logger.info(f"No date provided, using today's date: {target_date}")
        
        # Date for sleep data - use previous day by default as sleep is usually recorded for the night before
        sleep_date = data.get('sleep_date')
        if not sleep_date:
            # Default to yesterday for sleep data
            sleep_date = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
            logger.info(f"Using yesterday's date for sleep data: {sleep_date}")
        
        logger.info(f"📊 Fetching all data for date: {target_date} (sleep date: {sleep_date})")
        
        client = request.garmin_client
        
        response = {
            "stress": None,
            "sleep": None,
            "activity": None,
            "hrv": None,
            "heart_rate": None
        }
        
        # Fetch stress data
        try:
            logger.info(f"📈 Fetching stress data for {target_date}")
            start_time = time.time()
            stress_data = client.get_stress_data(target_date)
            elapsed = time.time() - start_time
            
            log_api_response("STRESS", stress_data)
            
            if stress_data:
                logger.info(f"✓ Stress data received (took {elapsed:.2f}s)")
                response["stress"] = {
                    "max_stress": stress_data.get("maxStressLevel", 0),
                    "avg_stress": stress_data.get("avgStressLevel", 0),
                    "date": target_date
                }
                logger.info(f"Processed stress data: max={stress_data.get('maxStressLevel', 0)}, avg={stress_data.get('avgStressLevel', 0)}")
            else:
                logger.warning(f"✗ No stress data available for {target_date}")
        except Exception as e:
            logger.error(f"✗ Error fetching stress data: {e}")
        
        # Fetch sleep data
        try:
            logger.info(f"🛌 Fetching sleep data for {sleep_date}")
            start_time = time.time()
            sleep_data = client.get_sleep_data(sleep_date)
            elapsed = time.time() - start_time
            
            log_api_response("SLEEP", sleep_data)
            
            # Initialize daily_sleep as None before checking
            daily_sleep = None
            
            if sleep_data and 'dailySleepDTO' in sleep_data:
                logger.info(f"✓ Sleep data received (took {elapsed:.2f}s)")
                daily_sleep = sleep_data['dailySleepDTO']
                
                # Only process sleep data if daily_sleep exists
                if daily_sleep:
                    sleep_start = daily_sleep.get('sleepStartTimestampLocal')
                    sleep_end = daily_sleep.get('sleepEndTimestampLocal')

                    if not sleep_start or not sleep_end:
                        logger.warning("❗ Sleep data is missing timestamps!")
                        sleep_start, sleep_end = None, None  # Prevents issues later

                    response["sleep"] = {
                        "summary": {
                            "total_sleep_seconds": daily_sleep.get('sleepTimeSeconds', 0),
                            "deep_sleep_seconds": daily_sleep.get('deepSleepSeconds', 0),
                            "light_sleep_seconds": daily_sleep.get('lightSleepSeconds', 0),
                            "rem_sleep_seconds": daily_sleep.get('remSleepSeconds', 0),
                            "awake_seconds": daily_sleep.get('awakeSleepSeconds', 0),
                            "sleep_start": sleep_start,
                            "sleep_end": sleep_end,
                            "sleep_score": str(daily_sleep.get('sleepScoreValue', 'N/A')),
                            "average_hrv": sleep_data.get('hrvSummary', {}).get('avgHrv'),
                            "lowest_hrv": sleep_data.get('hrvSummary', {}).get('lowHrv'),
                            "highest_hrv": sleep_data.get('hrvSummary', {}).get('highHrv')
                        },
                        "phases": []
                    }
                    
                    # Log the processed sleep data
                    hours = daily_sleep.get('sleepTimeSeconds', 0) / 3600
                    deep_pct = (daily_sleep.get('deepSleepSeconds', 0) / daily_sleep.get('sleepTimeSeconds', 1)) * 100 if daily_sleep.get('sleepTimeSeconds', 0) > 0 else 0
                    logger.info(f"Sleep summary: {hours:.1f} hours total, {deep_pct:.1f}% deep sleep, score: {daily_sleep.get('sleepScoreValue', 'N/A')}")
                else:
                    logger.warning("❗ dailySleepDTO exists but contains no data")
            else:
                logger.warning(f"✗ No sleep data available for date: {sleep_date}")
                logger.info(f"Try checking these dates: yesterday={datetime.now() - timedelta(days=1)}, day before={(datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')}")

        except Exception as e:
            logger.error(f"✗ Error fetching sleep data: {e}")
        
        # Fetch activity data
        try:
            logger.info(f"🏃 Fetching activity data for {target_date}")
            stats = None
            activities = []
            
            try:
                logger.info("Fetching daily stats...")
                start_time = time.time()
                stats = client.get_stats(target_date)
                elapsed = time.time() - start_time
                
                log_api_response("STATS", stats)
                logger.info(f"✓ Stats data received (took {elapsed:.2f}s)")
            except Exception as e:
                logger.error(f"✗ Error fetching stats: {e}")
                if "privacyProtected" in str(e):
                    logger.warning("⚠️ Stats data is privacy protected")
                stats = None
            
            try:
                logger.info("Fetching recent activities...")
                start_time = time.time()
                activities = client.get_activities(0, 10)  # Get recent activities
                elapsed = time.time() - start_time
                
                log_api_response("ACTIVITIES", activities)
                logger.info(f"✓ Activities data received: {len(activities)} activities (took {elapsed:.2f}s)")
            except Exception as e:
                logger.error(f"✗ Error fetching activities: {e}")
                if "privacyProtected" in str(e):
                    logger.warning("⚠️ Activities data is privacy protected")
                activities = []
            
            # Initialize a basic activity response
            response["activity"] = {
                "steps": 0,
                "calories_burned": 0,
                "active_minutes": 0,
                "distance_km": 0,
                "floors_climbed": 0,
                "active_time_seconds": 0,
                "date": target_date,
                "vo2_max": 0,
                "vo2_max_status": "N/A",
                "vo2_max_date": "",
                "daily_activities": [],
                "privacy_protected": False
            }
            
            if stats:
                total_distance = stats.get("totalDistanceMeters")
                if total_distance is None:
                    total_distance = 0  # Default to 0 instead of None

                # Update with actual data
                response["activity"].update({
                    "steps": stats.get("totalSteps", 0),
                    "calories_burned": stats.get("totalKilocalories", 0),
                    "active_minutes": (
                        stats.get("moderateIntensityMinutes", 0) +
                        stats.get("vigorousIntensityMinutes", 0)
                    ),
                    "distance_km": total_distance / 1000,  # Safe division
                    "floors_climbed": stats.get("floorsAscended", 0),
                    "active_time_seconds": stats.get("activeTimeSeconds", 0),
                })
                
                # Log the processed activity stats
                logger.info(f"Activity summary: {stats.get('totalSteps', 0)} steps, {total_distance/1000:.2f} km, {stats.get('totalKilocalories', 0)} calories")
            else:
                logger.warning("No stats data available or privacy protected")
                response["activity"]["privacy_protected"] = True
                
            # Add activities for the target date if available
            target_date_activities = []
            if activities:
                for activity in activities:
                    activity_date = activity.get("startTimeLocal", "").split()[0]
                    if activity_date == target_date:
                        activity_info = {
                            "type": activity.get("activityType", {}).get("typeKey", "Unknown").replace('_', ' ').title(),
                            "duration_minutes": round(activity.get("duration", 0) / 60, 1)
                        }
                        target_date_activities.append(activity_info)
                        response["activity"]["daily_activities"].append(activity_info)
                        
                        # Get VO2 max from activity if available
                        vo2_max = activity.get("vO2MaxValue")
                        if vo2_max and vo2_max > 0:
                            response["activity"]["vo2_max"] = vo2_max
                            response["activity"]["vo2_max_date"] = activity_date
                            
                            # Map VO2 max to status
                            if vo2_max >= 60:
                                status = "Superior"
                            elif vo2_max >= 52:
                                status = "Excellent"
                            elif vo2_max >= 45:
                                status = "Good"
                            elif vo2_max >= 38:
                                status = "Fair"
                            elif vo2_max >= 35:
                                status = "Poor"
                            else:
                                status = "Very Poor"
                            response["activity"]["vo2_max_status"] = status
                            logger.info(f"VO2 max: {vo2_max} ({status})")
                
                if target_date_activities:
                    logger.info(f"Found {len(target_date_activities)} activities for {target_date}: {', '.join([a['type'] for a in target_date_activities])}")
                else:
                    logger.info(f"No activities found for {target_date}")
        except Exception as e:
            logger.error(f"✗ Error fetching activity data: {e}")
        
        # Fetch HRV data
        try:
            logger.info(f"❤️ Fetching HRV data for {target_date}")
            start_time = time.time()
            hrv_data = client.get_hrv_data(target_date)
            elapsed = time.time() - start_time
            
            log_api_response("HRV", hrv_data)
            
            if hrv_data and 'hrvSummary' in hrv_data:
                logger.info(f"✓ HRV data received (took {elapsed:.2f}s)")
                response["hrv"] = {
                    "summary": {
                        "lastNightAvg": hrv_data['hrvSummary'].get('lastNightAvg'),
                        "lastNight5MinHigh": hrv_data['hrvSummary'].get('lastNight5MinHigh'),
                        "status": hrv_data['hrvSummary'].get('status'),
                        "feedbackPhrase": hrv_data['hrvSummary'].get('feedbackPhrase')
                    },
                    "readings": []
                }
                
                readings_count = 0
                for reading in hrv_data.get('hrvReadings', []):
                    if reading.get('hrvValue') and reading.get('readingTimeLocal'):
                        response["hrv"]["readings"].append({
                            "time": reading['readingTimeLocal'],
                            "value": reading['hrvValue']
                        })
                        readings_count += 1
                
                logger.info(f"HRV summary: avg={hrv_data['hrvSummary'].get('lastNightAvg')}, status={hrv_data['hrvSummary'].get('status')}, {readings_count} readings")
            else:
                logger.warning(f"✗ No HRV data available for {target_date}")
        except Exception as e:
            logger.error(f"✗ Error fetching HRV data: {e}")
        
        logger.info("✅ All data fetching completed, returning response")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"❌ Error in get_all_data: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Configure Garmin client
    Garmin.DEFAULT_RETRY_COUNT = 3
    Garmin.DEFAULT_RETRY_TIMEOUT = 5
    
    # Get port from environment variable or use default
    port = int(os.environ.get("PORT", 5001))
    
    logger.info(f"🚀 Starting Flask server on port {port}")
    
    # Run the app
    app.run(host='0.0.0.0', port=port, debug=False) 