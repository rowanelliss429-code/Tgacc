import asyncio
import sys
import json
import re
from datetime import datetime, timedelta, timezone
from telethon import TelegramClient, functions
from telethon.sessions import StringSession

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

async def fetch_otp_and_check_login(session_str):
    try:
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()
        
        if not await client.is_user_authorized():
            return {"error": "Session is invalid or expired"}
            
        # 1. Fetch latest OTP message from 777000
        target_id = 777000
        messages = await client.get_messages(target_id, limit=5)
        
        otp_data = None
        if messages:
            for msg in messages:
                text = msg.text
                if not otp_data and re.search(r'\b\d{5,6}\b', text):
                    otp_data = {
                        "text": text,
                        "date": str(msg.date)
                    }
                    break

        # 2. Check for new authorizations (active devices)
        new_login_detected = False
        try:
            authorizations = await client(functions.account.GetAuthorizationsRequest())
            # A new login is detected if there's more than 1 session 
            # OR if a session was created very recently (e.g., in the last 10 minutes)
            now = datetime.now(timezone.utc)
            for auth in authorizations.authorizations:
                # If the authorization is not the current one and was created recently
                if not auth.current:
                    auth_date = auth.date
                    if now - auth_date < timedelta(minutes=10):
                        new_login_detected = True
                        break
            
            # Also, if total sessions > 1, it's highly likely a user has logged in
            if not new_login_detected and len(authorizations.authorizations) > 1:
                new_login_detected = True
        except Exception as auth_err:
            print(f"Auth check error: {auth_err}", file=sys.stderr)

        return {
            "otp": otp_data,
            "new_login": new_login_detected
        }
    except Exception as e:
        return {"error": str(e)}
    finally:
        try:
            await client.disconnect()
        except:
            pass

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No session string provided"}))
        sys.exit(1)
        
    session_input = sys.argv[1]
    result = asyncio.run(fetch_otp_and_check_login(session_input))
    print(json.dumps(result))
