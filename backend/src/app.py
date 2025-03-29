import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from garminconnect import Garmin
import logging
from functools import wraps
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
            client.get_user_summary(cdate=test_date)
            logger.info(f"Using cached session for {email}")
            return client
        except Exception as e:
            logger.info(f"Cached session expired, creating new login: {e}")
    
    try:
        client = Garmin(email, password)
        client.login()
        client_cache[cache_key] = client
        logger.info(f"Created new session for {email}")
        return client
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise Exception("Authentication failed. Please check your credentials.")

def require_auth(f):
    """Decorator to handle authentication for routes"""
    @wraps(f)
    def decorated(*args, **kwargs):
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        email = data.get('email')
        password = data.get('password')
        
        if not email or not password:
            return jsonify({"error": "Email and password required"}), 400
        
        try:
            request.garmin_client = get_client(email, password)
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return jsonify({"error": str(e)}), 401
    
    return decorated

@app.route("/login", methods=["POST"])
@require_auth
def garmin_login():
    return jsonify({"status": "success"}), 200

@app.route("/all_data", methods=["POST"])
@require_auth
def get_all_data():
    try:
        data = request.get_json()
        # Get date from request, fall back to today's date if not provided
        target_date = data.get('date', datetime.now().strftime("%Y-%m-%d"))
        logger.info(f"Fetching data for date: {target_date}")
        
        client = request.garmin_client
        
        response = {
            "stress": None,
            "sleep": None,
            "activity": None,
            "hrv": None,
            "heart_rate": None
        }
        
        # Test endpoint accessibility
        try:
            # Try a low-restriction endpoint first
            heart_data = client.get_heart_rates(target_date)
            logger.info("Heart rate data accessible: Success")
            
            # If successful, try a medium-restriction endpoint
            stress_data = client.get_stress_data(target_date)
            logger.info("Stress data accessible: Success")
            
            # Finally try the higher-restriction endpoints
            sleep_data = client.get_sleep_data(target_date)
            logger.info("Sleep data accessible: Success")
        except Exception as e:
            logger.error(f"Error testing endpoint access: {e}")
        
        # Fetch stress data
        try:
            if stress_data:
                response["stress"] = {
                    "max_stress": stress_data.get("maxStressLevel", 0),
                    "avg_stress": stress_data.get("avgStressLevel", 0),
                    "date": target_date
                }
        except Exception as e:
            logger.error(f"Error fetching stress data: {e}")
        
        # Fetch sleep data
        try:
            daily_sleep = None
            
            if sleep_data and 'dailySleepDTO' in sleep_data:
                daily_sleep = sleep_data['dailySleepDTO']
                
                sleep_start = daily_sleep.get('sleepStartTimestampLocal')
                sleep_end = daily_sleep.get('sleepEndTimestampLocal')

                if not sleep_start or not sleep_end:
                    logger.warning("Sleep data is missing timestamps!")
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
            else:
                logger.warning(f"No sleep data available for date: {target_date}")

        except Exception as e:
            logger.error(f"Error fetching sleep data: {e}")
        
        # Fetch activity data
        try:
            stats = client.get_stats(target_date)
            activities = client.get_activities(0, 10)  # Get recent activities
            
            # Log activities data for debugging
            logger.info(f"Activity data retrieved: {len(activities)} activities")
            for idx, activity in enumerate(activities[:3]):  # Log first 3 activities
                activity_date = activity.get("startTimeLocal", "").split()[0] if activity.get("startTimeLocal") else "Unknown"
                vo2_max = activity.get("vO2MaxValue")
                logger.info(f"Activity {idx}: Date={activity_date}, Type={activity.get('activityType', {}).get('typeKey', 'Unknown')}, VO2Max={vo2_max}")
            
            # Initialize activity structure with default values
            response["activity"] = {
                "steps": 0,
                "calories_burned": 0,
                "active_minutes": 0,
                "distance_km": 0,
                "floors_climbed": 0,
                "active_time_seconds": 0,
                "date": target_date,
                "vo2_max": 0,
                "vo2_max_status": "",
                "vo2_max_date": "",
                "daily_activities": []
            }
            
            # Try to get direct VO2 max data if method is available
            try:
                if hasattr(client, 'get_user_metrics'):
                    logger.info("Attempting to fetch VO2 max from user metrics...")
                    try:
                        user_metrics = client.get_user_metrics()
                        if user_metrics is not None:
                            logger.info(f"User metrics retrieved: {user_metrics}")
                            if 'vo2Max' in user_metrics:
                                vo2_max_value = user_metrics.get('vo2Max')
                                logger.info(f"Found VO2 max in user metrics: {vo2_max_value}")
                                if vo2_max_value and vo2_max_value > 0:
                                    response["activity"]["vo2_max"] = vo2_max_value
                                    response["activity"]["vo2_max_date"] = target_date
                                    
                                    # Map VO2 max to status
                                    if vo2_max_value >= 60:
                                        status = "Superior"
                                    elif vo2_max_value >= 52:
                                        status = "Excellent"
                                    elif vo2_max_value >= 45:
                                        status = "Good"
                                    elif vo2_max_value >= 38:
                                        status = "Fair"
                                    elif vo2_max_value >= 35:
                                        status = "Poor"
                                    else:
                                        status = "Very Poor"
                                    response["activity"]["vo2_max_status"] = status
                        else:
                            logger.warning("get_user_metrics() returned None")
                    except Exception as e:
                        logger.error(f"Error calling get_user_metrics(): {e}")
            except Exception as e:
                logger.error(f"Error fetching direct VO2 max data: {e}")
            
            # Update with stats if available
            if stats:
                total_distance = stats.get("totalDistanceMeters", 0)
                response["activity"].update({
                    "steps": stats.get("totalSteps", 0),
                    "calories_burned": stats.get("totalKilocalories", 0),
                    "active_minutes": (
                        stats.get("moderateIntensityMinutes", 0) +
                        stats.get("vigorousIntensityMinutes", 0)
                    ),
                    "distance_km": total_distance / 1000 if total_distance else 0,
                    "floors_climbed": stats.get("floorsAscended", 0),
                    "active_time_seconds": stats.get("activeTimeSeconds", 0),
                })
                
                # Add activities for the target date
                for activity in activities:
                    if activity is None:
                        continue
                        
                    activity_date = ""
                    if activity.get("startTimeLocal"):
                        date_parts = activity.get("startTimeLocal", "").split()
                        if date_parts:
                            activity_date = date_parts[0]
                    
                    if activity_date == target_date:
                        activity_type = "Unknown"
                        if activity.get("activityType") and isinstance(activity.get("activityType"), dict):
                            activity_type = activity.get("activityType", {}).get("typeKey", "Unknown")
                        
                        response["activity"]["daily_activities"].append({
                            "type": activity_type.replace('_', ' ').title(),
                            "duration_minutes": round(activity.get("duration", 0) / 60, 1)
                        })
                        
                        # Get VO2 max from activity if available and not already set
                        vo2_max = activity.get("vO2MaxValue")
                        if vo2_max and vo2_max > 0 and response["activity"]["vo2_max"] == 0:
                            logger.info(f"Found VO2 max in activity: {vo2_max}")
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
                            
            # Add mindful minutes if present
            response["activity"]["mindful_minutes"] = 0  # Default value
                
        except Exception as e:
            logger.error(f"Error fetching activity data: {e}")
            # Ensure activity data is initialized even on error
            if "activity" not in response:
                response["activity"] = {
                    "steps": 0,
                    "calories_burned": 0,
                    "active_minutes": 0,
                    "distance_km": 0,
                    "floors_climbed": 0,
                    "active_time_seconds": 0,
                    "date": target_date,
                    "vo2_max": 0,
                    "vo2_max_status": "",
                    "vo2_max_date": "",
                    "daily_activities": [],
                    "mindful_minutes": 0
                }
        
        # Fetch HRV data
        try:
            # Check which HRV method is available
            if hasattr(client, 'get_hrv_data'):
                hrv_data = client.get_hrv_data(target_date)
            elif hasattr(client, 'get_heart_rate_variability_data'):
                hrv_data = client.get_heart_rate_variability_data(target_date)
            else:
                # Fallback if no HRV method available
                logger.warning("HRV methods not available in this library version")
                hrv_data = {"summary": {}, "readings": []}
            
            if hrv_data and 'hrvSummary' in hrv_data:
                response["hrv"] = {
                    "summary": {
                        "lastNightAvg": hrv_data['hrvSummary'].get('lastNightAvg'),
                        "lastNight5MinHigh": hrv_data['hrvSummary'].get('lastNight5MinHigh'),
                        "status": hrv_data['hrvSummary'].get('status'),
                        "feedbackPhrase": hrv_data['hrvSummary'].get('feedbackPhrase')
                    },
                    "readings": []
                }
                
                for reading in hrv_data.get('hrvReadings', []):
                    if reading.get('hrvValue') and reading.get('readingTimeLocal'):
                        response["hrv"]["readings"].append({
                            "time": reading['readingTimeLocal'],
                            "value": reading['hrvValue']
                        })
        except Exception as e:
            logger.error(f"Error fetching HRV data: {e}")
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error in get_all_data: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Configure Garmin client
    Garmin.DEFAULT_RETRY_COUNT = 3
    Garmin.DEFAULT_RETRY_TIMEOUT = 5
    
    # Get port from environment variable or use default
    port = int(os.environ.get("PORT", 5002))
    
    # Run the app
    app.run(host='0.0.0.0', port=port, debug=False) 