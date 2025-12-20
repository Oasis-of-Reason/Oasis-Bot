import { google, calendar_v3 } from "googleapis";
import serviceAccount from "../utils/googleBotCalendar.json";

export class GoogleCalendarService {
  private calendar!: calendar_v3.Calendar;

  private googleAuth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });

  async init() {
    this.calendar = google.calendar({
      version: "v3",
      auth: this.googleAuth,
    });

    // optional sanity check
    await this.calendar.calendarList.list({ maxResults: 1 });
  }

  get client() {
    if (!this.calendar) throw new Error("GoogleCalendarService not initialized");
    return this.calendar;
  }
}

// singleton instance
export const calendarService = new GoogleCalendarService();
