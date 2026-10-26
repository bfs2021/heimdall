import { useState } from 'react'
import { Calendar, type CalendarEvent, type CalendarView } from '../components/Calendar'
import { MiniCalendar } from '../components/MiniCalendar'

const generateSampleEvents = (): CalendarEvent[] => {
  const events: CalendarEvent[] = [
    {
      id: 'event-0',
      title: 'Event 1',
      calendarId: 'calendar-1',
      startDate: new Date(2026, 5, 5),
    },
    {
      id: 'event-1',
      title: 'Event 2',
      calendarId: 'calendar-2',
      startDate: new Date(2026, 5, 8),
    },
    {
      id: 'event-2',
      title: 'Event 3',
      calendarId: 'calendar-3',
      startDate: new Date(2026, 5, 10),
    },
    {
      id: 'event-3',
      title: 'Event 4',
      calendarId: 'calendar-1',
      startDate: new Date(2026, 5, 12),
    },
    {
      id: 'event-4',
      title: 'Event 5',
      calendarId: 'calendar-2',
      startDate: new Date(2026, 5, 15),
    },
    {
      id: 'event-5',
      title: 'Event 6',
      calendarId: 'calendar-3',
      startDate: new Date(2026, 5, 18),
    },
    {
      id: 'event-6',
      title: 'Event 7',
      calendarId: 'calendar-1',
      startDate: new Date(2026, 5, 20),
    },
    {
      id: 'event-7',
      title: 'Event 8',
      calendarId: 'calendar-2',
      startDate: new Date(2026, 5, 22),
    },
    {
      id: 'event-8',
      title: 'Event 9',
      calendarId: 'calendar-3',
      startDate: new Date(2026, 5, 25),
    },
    {
      id: 'event-9',
      title: 'Event 10',
      calendarId: 'calendar-1',
      startDate: new Date(2026, 5, 28),
    },
    {
      id: 'event-10',
      title: 'Event 11',
      calendarId: 'calendar-2',
      startDate: new Date(2026, 5, 3),
    },
    {
      id: 'event-11',
      title: 'Event 12',
      calendarId: 'calendar-3',
      startDate: new Date(2026, 5, 4),
    },
    {
      id: 'event-12',
      title: 'Event 13',
      calendarId: 'calendar-1',
      startDate: new Date(2026, 5, 6),
    },
    {
      id: 'event-13',
      title: 'Event 14',
      calendarId: 'calendar-2',
      startDate: new Date(2026, 5, 9),
    },
    {
      id: 'event-14',
      title: 'Event 15',
      calendarId: 'calendar-3',
      startDate: new Date(2026, 5, 11),
    },
  ]

  return events
}

export default function CalendarTestPage() {
  const [currentView, setCurrentView] = useState<CalendarView>('month')
  const [focusedDate, setFocusedDate] = useState(new Date(2026, 5, 3))
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(2026, 5, 3))
  const [events] = useState<CalendarEvent[]>(generateSampleEvents())
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null)
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0)

  const calendarColors: Record<string, string> = {
    'calendar-1': 'rgb(var(--status-cyan))',
    'calendar-2': 'rgb(var(--status-emerald))',
    'calendar-3': 'rgb(var(--status-rose))',
  }

  return (
    <div style={{ padding: '22px 28px', backgroundColor: 'rgb(var(--canvas-bg))', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <h1 style={{ color: 'rgb(var(--canvas-fg-1))', marginBottom: '28px' }}>Calendar Components</h1>

        {/* Configuration Section */}
        <section style={{ marginBottom: '32px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgb(var(--canvas-fg-3))',
              marginBottom: '14px',
            }}
          >
            Configuration
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', color: 'rgb(var(--canvas-fg-2))' }}>
                Week starts on:
              </label>
              <select
                value={weekStartsOn}
                onChange={(e) => setWeekStartsOn(parseInt(e.target.value) as 0 | 1)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgb(var(--canvas-border))',
                  backgroundColor: 'rgb(var(--canvas-surface))',
                  color: 'rgb(var(--canvas-fg-1))',
                }}
              >
                <option value={0}>Sunday</option>
                <option value={1}>Monday</option>
              </select>
            </div>
            <div>
              <p style={{ color: 'rgb(var(--canvas-fg-2))', marginBottom: '4px' }}>
                <strong>Selected Date:</strong> {selectedDate?.toLocaleDateString()}
              </p>
              <p style={{ color: 'rgb(var(--canvas-fg-2))', marginBottom: '4px' }}>
                <strong>Selected Event:</strong> {selectedEvent || 'None'}
              </p>
            </div>
          </div>
        </section>

        {/* Main Calendar + MiniCalendar Layout */}
        <section style={{ marginBottom: '32px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgb(var(--canvas-fg-3))',
              marginBottom: '14px',
            }}
          >
            Calendar View
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Flex column so the Calendar stretches to the min-height. `height: 100%`
                  on .calendar can't resolve against a min-height parent, and a separate
                  host fill would show below short views (Day, Week) as a second surface. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid rgb(var(--canvas-border))',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  minHeight: '500px',
                }}
              >
                <Calendar
                  style={{ flex: 1 }}
                  view={currentView}
                  focusedDate={focusedDate}
                  selectedDate={selectedDate}
                  events={events}
                  calendarColors={calendarColors}
                  weekStartsOn={weekStartsOn}
                  onChangeView={setCurrentView}
                  onNavigate={setFocusedDate}
                  onSelectDate={setSelectedDate}
                  onSelectEvent={setSelectedEvent}
                />
              </div>
            </div>

            <div>
              <div
                style={{
                  background: 'rgb(var(--canvas-surface))',
                  border: '1px solid rgb(var(--canvas-border))',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  width: '280px',
                  padding: '12px',
                }}
              >
                <MiniCalendar
                  focusedDate={focusedDate}
                  selectedDate={selectedDate}
                  weekStartsOn={weekStartsOn}
                  onSelect={(date) => {
                    setFocusedDate(date)
                    setSelectedDate(date)
                  }}
                  markers={events.map((e) => new Date(e.startDate))}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Events Legend */}
        <section style={{ marginBottom: '32px' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgb(var(--canvas-fg-3))',
              marginBottom: '14px',
            }}
          >
            Calendar Legend
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            {Object.entries(calendarColors).map(([calendarId, color]) => (
              <div
                key={calendarId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  background: 'rgb(var(--canvas-surface))',
                  border: '1px solid rgb(var(--canvas-border))',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '2px',
                    backgroundColor: color,
                  }}
                />
                <span style={{ color: 'rgb(var(--canvas-fg-1))', fontSize: '12px' }}>
                  {calendarId.replace('calendar-', 'Calendar ')}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Events Table */}
        <section>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgb(var(--canvas-fg-3))',
              marginBottom: '14px',
            }}
          >
            All Events ({events.length})
          </div>
          <div
            style={{
              background: 'rgb(var(--canvas-surface))',
              border: '1px solid rgb(var(--canvas-border))',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'rgb(var(--canvas-bg-2))', borderBottom: '1px solid rgb(var(--canvas-border))' }}>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(var(--canvas-fg-2))',
                    }}
                  >
                    Title
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(var(--canvas-fg-2))',
                    }}
                  >
                    Calendar
                  </th>
                  <th
                    style={{
                      padding: '8px 12px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: 'rgb(var(--canvas-fg-2))',
                    }}
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr
                    key={event.id}
                    style={{
                      borderBottom: '1px solid rgb(var(--canvas-border))',
                      backgroundColor:
                        selectedEvent === event.id ? 'rgb(var(--accent-primary-bg-alpha-xs))' : 'transparent',
                      cursor: 'pointer',
                      transition: 'background-color 0.08s',
                    }}
                    onClick={() => setSelectedEvent(event.id)}
                  >
                    <td
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'rgb(var(--canvas-fg-1))',
                      }}
                    >
                      {event.title}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'rgb(var(--canvas-fg-2))',
                      }}
                    >
                      {event.calendarId.replace('calendar-', 'Cal ')}
                    </td>
                    <td
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'rgb(var(--canvas-fg-2))',
                      }}
                    >
                      {new Date(event.startDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
