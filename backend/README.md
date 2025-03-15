# Garmin Health Tracker Backend

This is the backend server for the Garmin Health Tracker application. It provides APIs for authenticating with Garmin Connect and fetching health metrics data.

## Setup

1. Create a virtual environment and activate it:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Edit `.env` file with your Garmin Connect credentials and desired configuration.

## Local Development

Run the development server:
```bash
python src/app.py
```

The server will start at http://localhost:5000

## Deployment to Heroku

1. Install Heroku CLI and login:
```bash
heroku login
```

2. Create a new Heroku app:
```bash
heroku create your-app-name
```

3. Set environment variables:
```bash
heroku config:set GARMIN_EMAIL=your_email@example.com
heroku config:set GARMIN_PASSWORD=your_password
heroku config:set DEBUG=False
```

4. Deploy:
```bash
git push heroku main
```

## API Endpoints

### POST /login
Authenticates user with Garmin Connect.

Request body:
```json
{
    "email": "your_email@example.com",
    "password": "your_password"
}
```

### GET /all_data
Fetches various health metrics from Garmin Connect.

Query parameters:
- `start_date`: Start date in YYYY-MM-DD format
- `end_date`: End date in YYYY-MM-DD format (optional, defaults to today)

## Error Handling

The API returns appropriate HTTP status codes and error messages in JSON format:

- 400: Bad Request (invalid parameters)
- 401: Unauthorized (invalid credentials)
- 500: Internal Server Error (server-side issues)

## Security

- Credentials are stored in environment variables
- CORS is enabled for the frontend application
- Session caching is implemented to minimize Garmin Connect login requests 