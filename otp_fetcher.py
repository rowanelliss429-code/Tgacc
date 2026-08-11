import asyncio
import sys
import json
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

async def fetch_otp(session_str):
    try:
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()
        
        if not await client.is_user_authorized():
            return {"error": "Session is invalid or expired"}
            
        target_id = 777000
        messages = await client.get_messages(target_id, limit=1)
        
        if not messages:
            return {"error": "No messages found from Telegram"}
            
        msg = messages[0]
        return {
            "text": msg.text,
            "date": str(msg.date)
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
    result = asyncio.run(fetch_otp(session_input))
    print(json.dumps(result))
