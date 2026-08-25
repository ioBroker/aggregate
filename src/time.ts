import type { SmartDate, TimeInterval } from './types';

export type { SmartDate };

/**
 * A date that can be advanced hour by hour while respecting the real length of
 * months, leap years and the central European daylight saving time switches.
 *
 * It is used to build "smart" intervals: intervals that follow the calendar
 * (a real day has 23, 24 or 25 hours, a real month 28..31 days) instead of a
 * fixed number of milliseconds.
 */
export class HSmartDate {
    /** Day of month: 1 .. 31 */
    private date: number;
    /** Month: 1 .. 12 */
    private month: number;
    /** Year: 1970 .. 2300 */
    private year: number;
    private hour: number;
    private isLeapYear: boolean;
    /** Day of week: 0 - Sunday, 1 - Monday */
    private dow: number;
    /** Time zone offset of the standard time in hours */
    private readonly timeZone: number;
    private lastSundayInMonth: number | undefined;
    private readonly end: boolean;
    private summerTime: boolean;

    constructor(date: SmartDate, end?: boolean) {
        this.year = date.year;
        this.month = date.month;
        this.date = date.date;
        // Time zone in hours. Germany +1
        if (date.timeZone === undefined) {
            this.timeZone = 1;
        } else {
            this.timeZone = date.timeZone;
        }
        this.end = !!end;

        const d = new Date(this.year, this.month - 1, this.date);

        this.hour = 0;
        this.dow = d.getDay();
        this.isLeapYear = HSmartDate.isLeap(this.year);
        if (this.month === 3 || this.month === 10) {
            this.lastSundayInMonth = HSmartDate.getLastSundayOfMonth(this.year, this.month);
        }

        // calculate if it is daylight saving time
        this.summerTime = HSmartDate.isDaylightSavingTime(d);
    }

    /**
     * Check if the given date is in the daylight saving time of the local time zone
     *
     * @param date date to check
     */
    static isDaylightSavingTime(date: Date): boolean {
        const january = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
        const july = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
        return date.getTimezoneOffset() < Math.max(january, july);
    }

    /**
     * Check if the given year is a leap year
     *
     * @param year full year, e.g. 2026
     */
    static isLeap(year: number): boolean {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    /**
     * Get the day of month of the last Sunday in the given month
     *
     * @param year full year, e.g. 2026
     * @param month month from 1 to 12
     */
    static getLastSundayOfMonth(year: number, month: number): number {
        // Get the last day of the month
        const lastDayOfMonth = new Date(year, month, 0);
        // Calculate the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const dayOfWeek = lastDayOfMonth.getDay();
        // Calculate the date of the last Sunday
        const lastSunday = new Date(lastDayOfMonth);
        lastSunday.setDate(lastDayOfMonth.getDate() - dayOfWeek);
        return lastSunday.getDate();
    }

    /** Timestamp in ms of the currently pointed hour */
    getTime(): number {
        const offset = this.end ? -1 : 0;
        const tz = this.summerTime ? (this.timeZone + 1) * 3_600_000 : this.timeZone * 3_600_000;
        return new Date(Date.UTC(this.year, this.month - 1, this.date, this.hour, 0, 0)).getTime() - tz + offset;
    }

    /**
     * Advance the date by one hour
     *
     * @returns -1 if the clock was set forward (start of the summer time), 1 if it was set back
     * (end of the summer time) and 0 if nothing special happened
     */
    getNextHour(): 0 | 1 | -1 {
        let result: 0 | 1 | -1 = 0;
        // Die mitteleuropaeische Sommerzeit beginnt am letzten Sonntag im Maerz um 2:00 Uhr MEZ,
        // indem die Stundenzaehlung um eine Stunde von 2:00 Uhr auf 3:00 Uhr vorgestellt wird
        if (this.month === 3 && this.date === this.lastSundayInMonth && this.hour === 2) {
            this.summerTime = true; // summer time
            result = -1;
        } else if (this.month === 10 && this.date === this.lastSundayInMonth && this.hour === 3) {
            // Sie endet jeweils am letzten Sonntag im Oktober um 3:00 Uhr MESZ,
            // indem die Stundenzaehlung um eine Stunde von 3:00 Uhr auf 2:00 Uhr zurueckgestellt wird.
            this.summerTime = false; // winter time
            result = 1;
        }

        if (this.hour < 23) {
            this.hour++;
            return result;
        }
        this.hour = 0;

        this.dow++;
        if (this.dow > 6) {
            this.dow = 0;
        }

        if (this.date <= 27) {
            this.date++;
            return result;
        }
        if (this.month === 2) {
            if (this.isLeapYear && this.date === 28) {
                this.date = 29;
                return result;
            }
            this.date = 1;
            this.month = 3;
            this.lastSundayInMonth = HSmartDate.getLastSundayOfMonth(this.year, this.month);
            return result;
        }
        if (this.date < 30) {
            this.date++;
            return result;
        }
        // date is 30 or 31
        if (
            this.month === 1 ||
            this.month === 3 ||
            this.month === 5 ||
            this.month === 7 ||
            this.month === 8 ||
            this.month === 10 ||
            this.month === 12
        ) {
            if (this.date < 31) {
                this.date++;
                return result;
            }
        }
        this.date = 1;
        this.month++;
        if (this.month === 10) {
            this.lastSundayInMonth = HSmartDate.getLastSundayOfMonth(this.year, this.month);
        }

        if (this.month > 12) {
            this.year++;
            this.isLeapYear = HSmartDate.isLeap(this.year);
            this.month = 1;
        }
        return result;
    }

    /** Currently pointed month from 1 to 12 */
    getMonth(): number {
        return this.month;
    }

    /** Currently pointed day of week: 0 - Sunday, 1 - Monday */
    getDayOfWeek(): number {
        return this.dow;
    }
}

/**
 * Build the list of calendar-aligned intervals between two smart dates
 *
 * @param startDate first interval starts here. `timeZone` must be set
 * @param intervalType length of one interval: real hour, real day or real month
 * @param endDate last interval ends here. If not provided, "now" is used
 * @param debug if `true`, every interval gets the human-readable `startS`/`endS` fields
 */
export function getSmartIntervals(
    startDate: SmartDate,
    intervalType: 'hour' | 'day' | 'month',
    endDate?: SmartDate | null,
    debug?: boolean,
): TimeInterval[] {
    if (typeof startDate.timeZone !== 'number') {
        throw new Error('Time zone not provided!');
    }

    const start = new HSmartDate(startDate);

    let endTs: number;
    if (endDate) {
        endDate.timeZone = startDate.timeZone;
        const endDateObj = new HSmartDate(endDate, true);
        endTs = endDateObj.getTime();
    } else {
        endTs = Date.now();
    }

    let nStart: number = start.getTime();
    let nEnd: number;
    const result: TimeInterval[] = [];

    if (endTs <= nStart) {
        return result;
    }

    const addInterval = (from: number, to: number): void => {
        const interval: TimeInterval = { start: from, end: to };
        if (debug) {
            interval.startS = new Date(from).toISOString();
            interval.endS = new Date(to).toISOString();
        }
        result.push(interval);
    };

    if (intervalType === 'hour') {
        // It is simple. Get the first hour and add 60 minutes till the end
        do {
            nStart = start.getTime();
            start.getNextHour();
            nEnd = start.getTime();
            addInterval(nStart, nEnd);
        } while (nEnd < endTs);
    } else if (intervalType === 'day') {
        do {
            nStart = start.getTime();
            for (let i = 0; i < 24; i++) {
                start.getNextHour();
            }
            nEnd = start.getTime();
            addInterval(nStart, nEnd);
        } while (nEnd < endTs);
    } else {
        let m = start.getMonth();
        nEnd = nStart;
        do {
            nStart = nEnd;
            let monthFinished = false;
            while (!monthFinished) {
                for (let i = 0; i < 24; i++) {
                    start.getNextHour();
                }
                if (m !== start.getMonth()) {
                    m = start.getMonth();
                    nEnd = start.getTime();
                    addInterval(nStart, nEnd);
                    monthFinished = true;
                }
            }
        } while (nEnd < endTs);
    }

    return result;
}
