import * as React from 'react'
import * as Lucide from 'lucide-react'

const APPOINTMENTS_STORAGE_KEY = 'keves.appointments.v1'
const BOOKING_DRAFT_STORAGE_KEY = 'keves.booking-draft.v1'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

type TimeSlot = '08:30' | '10:00' | '11:30' | '14:00' | '16:30' | '18:00'
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
type DayStatus = 'available' | 'full' | 'closed' | 'past' | 'outside'
type BookingStep = 'selection' | 'review' | 'result'
type SubmissionResult = 'success' | 'failure' | 'canceled' | null

type Appointment = {
  id: string
  dateKey: string
  timeSlot: TimeSlot
  fullName: string
  phoneNumber: string
  createdAt: string
}

type BookingDraft = {
  dateKey: string | null
  timeSlot: TimeSlot | null
  fullName: string
  phoneNumber: string
}

type CalendarDay = {
  date: Date
  dateKey: string
  status: DayStatus
  availableCount: number
  scheduledCount: number
}

const EMPTY_BOOKING_DRAFT: BookingDraft = {
  dateKey: null,
  timeSlot: null,
  fullName: '',
  phoneNumber: '',
}

const WEEKLY_SCHEDULE: Record<Weekday, readonly TimeSlot[]> = {
  0: ['10:00', '11:30', '16:30'],
  1: ['08:30', '10:00', '14:00', '16:30'],
  2: ['08:30', '11:30', '14:00', '18:00'],
  3: ['10:00', '11:30', '14:00', '16:30'],
  4: ['08:30', '10:00', '14:00', '18:00'],
  5: ['08:30', '10:00'],
  6: [],
}

const monthFormatter = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
})

const longDateFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

function App() {
  const initialDraft = React.useMemo(() => loadStoredBookingDraft(), [])
  const [appointments, setAppointments] = React.useState<Appointment[]>(loadStoredAppointments)
  const [bookingDraft, setBookingDraft] = React.useState<BookingDraft>(initialDraft)
  const [bookingStep, setBookingStep] = React.useState<BookingStep>('selection')
  const [submissionResult, setSubmissionResult] = React.useState<SubmissionResult>(null)
  const [confirmedAppointment, setConfirmedAppointment] = React.useState<Appointment | null>(null)
  const [visibleMonth, setVisibleMonth] = React.useState(() =>
    initialDraft.dateKey === null ? startOfMonth(new Date()) : startOfMonth(dateFromDateKey(initialDraft.dateKey)),
  )

  React.useEffect(() => {
    window.localStorage.setItem(BOOKING_DRAFT_STORAGE_KEY, JSON.stringify(bookingDraft))
  }, [bookingDraft])

  const calendarDays = React.useMemo(
    () => buildCalendarDays(visibleMonth, appointments),
    [appointments, visibleMonth],
  )
  const selectedDate = bookingDraft.dateKey === null ? null : dateFromDateKey(bookingDraft.dateKey)
  const selectedAvailableTimeSlots =
    selectedDate === null ? [] : availableTimeSlotsForDate(selectedDate, appointments)
  const canContinue =
    bookingDraft.dateKey !== null &&
    bookingDraft.timeSlot !== null &&
    selectedAvailableTimeSlots.includes(bookingDraft.timeSlot) &&
    isValidFullName(bookingDraft.fullName) &&
    isValidPhoneNumber(bookingDraft.phoneNumber)

  function handleMonthChange(monthOffset: number) {
    setVisibleMonth((currentMonth) =>
      startOfMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + monthOffset, 1)),
    )
    setBookingDraft((currentDraft) => ({ ...currentDraft, dateKey: null, timeSlot: null }))
  }

  function handleDateToggle(calendarDay: CalendarDay) {
    const canSelectDay = calendarDay.status !== 'outside' && calendarDay.status !== 'past'
    if (!canSelectDay) {
      return
    }

    setBookingDraft((currentDraft) => ({
      ...currentDraft,
      dateKey: currentDraft.dateKey === calendarDay.dateKey ? null : calendarDay.dateKey,
      timeSlot: null,
    }))
  }

  function handleTimeSlotToggle(timeSlot: TimeSlot) {
    setBookingDraft((currentDraft) => ({
      ...currentDraft,
      timeSlot: currentDraft.timeSlot === timeSlot ? null : timeSlot,
    }))
  }

  function handleDraftFieldChange(fieldName: 'fullName' | 'phoneNumber', value: string) {
    setBookingDraft((currentDraft) => ({ ...currentDraft, [fieldName]: value }))
  }

  function handleSubmitAppointment() {
    const selectedDateKey = bookingDraft.dateKey
    const selectedTimeSlot = bookingDraft.timeSlot

    if (selectedDateKey === null || selectedTimeSlot === null) {
      setConfirmedAppointment(null)
      setSubmissionResult('failure')
      setBookingStep('result')
      return
    }

    const latestAppointments = loadStoredAppointments()
    const availableTimeSlots = availableTimeSlotsForDate(dateFromDateKey(selectedDateKey), latestAppointments)
    const slotIsAvailable = availableTimeSlots.includes(selectedTimeSlot)

    if (!slotIsAvailable) {
      setAppointments(latestAppointments)
      setConfirmedAppointment(null)
      setSubmissionResult('failure')
      setBookingStep('result')
      return
    }

    const appointment = {
      id: window.crypto.randomUUID(),
      dateKey: selectedDateKey,
      timeSlot: selectedTimeSlot,
      fullName: bookingDraft.fullName.trim(),
      phoneNumber: bookingDraft.phoneNumber.trim(),
      createdAt: new Date().toISOString(),
    }
    const nextAppointments = [...latestAppointments, appointment]

    saveStoredAppointments(nextAppointments)
    setAppointments(nextAppointments)
    setConfirmedAppointment(appointment)
    setSubmissionResult('success')
    setBookingStep('result')
  }

  function handleCancelAppointment() {
    if (confirmedAppointment === null) {
      return
    }

    const nextAppointments = loadStoredAppointments().filter(
      (appointment) => appointment.id !== confirmedAppointment.id,
    )

    saveStoredAppointments(nextAppointments)
    setAppointments(nextAppointments)
    setSubmissionResult('canceled')
    window.localStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY)
  }

  return (
    <main className="min-h-svh bg-[#f5f7fb] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="border-b border-slate-200 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-teal-700">
              Physiotherapy
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Book an appointment
            </h1>
          </div>
        </header>

        {bookingStep === 'selection' && (
          <BookingSelection
            bookingDraft={bookingDraft}
            calendarDays={calendarDays}
            canContinue={canContinue}
            onContinue={() => setBookingStep('review')}
            onDateToggle={handleDateToggle}
            onDraftFieldChange={handleDraftFieldChange}
            onMonthChange={handleMonthChange}
            onTimeSlotToggle={handleTimeSlotToggle}
            selectedDate={selectedDate}
            selectedAvailableTimeSlots={selectedAvailableTimeSlots}
            visibleMonth={visibleMonth}
          />
        )}

        {bookingStep === 'review' && (
          <ReviewScreen
            bookingDraft={bookingDraft}
            onBack={() => setBookingStep('selection')}
            onSubmit={handleSubmitAppointment}
          />
        )}

        {bookingStep === 'result' && (
          <ResultScreen
            bookingDraft={bookingDraft}
            onCancelAppointment={handleCancelAppointment}
            submissionResult={submissionResult}
          />
        )}
      </section>
    </main>
  )
}

type BookingSelectionProps = {
  bookingDraft: BookingDraft
  calendarDays: readonly CalendarDay[]
  canContinue: boolean
  onContinue: () => void
  onDateToggle: (calendarDay: CalendarDay) => void
  onDraftFieldChange: (fieldName: 'fullName' | 'phoneNumber', value: string) => void
  onMonthChange: (monthOffset: number) => void
  onTimeSlotToggle: (timeSlot: TimeSlot) => void
  selectedDate: Date | null
  selectedAvailableTimeSlots: readonly TimeSlot[]
  visibleMonth: Date
}

function BookingSelection({
  bookingDraft,
  calendarDays,
  canContinue,
  onContinue,
  onDateToggle,
  onDraftFieldChange,
  onMonthChange,
  onTimeSlotToggle,
  selectedDate,
  selectedAvailableTimeSlots,
  visibleMonth,
}: BookingSelectionProps) {
  const selectedDateLabel = selectedDate === null ? 'No date selected' : longDateFormatter.format(selectedDate)
  const showContactFields = bookingDraft.dateKey !== null && bookingDraft.timeSlot !== null

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
        <CalendarMonth
          calendarDays={calendarDays}
          onDateToggle={onDateToggle}
          onMonthChange={onMonthChange}
          selectedDateKey={bookingDraft.dateKey}
          visibleMonth={visibleMonth}
        />
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Available times</p>
            <h2 className="text-xl font-semibold tracking-normal text-slate-950">{selectedDateLabel}</h2>
          </div>

          {bookingDraft.timeSlot !== null && (
            <div className="inline-flex w-fit items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800">
              <Lucide.Clock className="h-4 w-4" aria-hidden="true" />
              {bookingDraft.timeSlot}
            </div>
          )}
        </div>

        <TimeSlotPicker
          bookingDraft={bookingDraft}
          onTimeSlotToggle={onTimeSlotToggle}
          availableTimeSlots={selectedAvailableTimeSlots}
          selectedDate={selectedDate}
        />

        {showContactFields && (
          <ContactFields bookingDraft={bookingDraft} onDraftFieldChange={onDraftFieldChange} />
        )}

        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
            disabled={!canContinue}
            onClick={onContinue}
          >
            Continue
            {canContinue && <Lucide.Check className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </section>
    </div>
  )
}

type CalendarMonthProps = {
  calendarDays: readonly CalendarDay[]
  onDateToggle: (calendarDay: CalendarDay) => void
  onMonthChange: (monthOffset: number) => void
  selectedDateKey: string | null
  visibleMonth: Date
}

function CalendarMonth({
  calendarDays,
  onDateToggle,
  onMonthChange,
  selectedDateKey,
  visibleMonth,
}: CalendarMonthProps) {
  const calendarWeeks = chunkCalendarWeeks(calendarDays)
  const previousMonthIsPast = startOfMonth(visibleMonth).getTime() <= startOfMonth(new Date()).getTime()

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          title="Previous month"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={previousMonthIsPast}
          onClick={() => onMonthChange(-1)}
        >
          <Lucide.ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="inline-flex items-center gap-2 text-lg font-semibold text-slate-950">
          <Lucide.Calendar className="h-5 w-5 text-teal-700" aria-hidden="true" />
          {monthFormatter.format(visibleMonth)}
        </div>

        <button
          type="button"
          title="Next month"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          onClick={() => onMonthChange(1)}
        >
          <Lucide.ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((weekdayLabel) => (
              <th
                className="pb-2 text-center text-xs font-semibold uppercase tracking-[0.08em] text-slate-500"
                key={weekdayLabel}
                scope="col"
              >
                {weekdayLabel}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {calendarWeeks.map((calendarWeek) => (
            <tr key={calendarWeek.map((calendarDay) => calendarDay.dateKey).join(':')}>
              {calendarWeek.map((calendarDay) => (
                <td className="p-1 align-top" key={calendarDay.dateKey}>
                  <CalendarDateButton
                    calendarDay={calendarDay}
                    isSelected={selectedDateKey === calendarDay.dateKey}
                    onDateToggle={onDateToggle}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type CalendarDateButtonProps = {
  calendarDay: CalendarDay
  isSelected: boolean
  onDateToggle: (calendarDay: CalendarDay) => void
}

function CalendarDateButton({ calendarDay, isSelected, onDateToggle }: CalendarDateButtonProps) {
  const isDisabled = calendarDay.status === 'outside' || calendarDay.status === 'past'
  const buttonClassName = [
    'flex min-h-20 w-full flex-col items-start justify-between rounded-md border p-2 text-left transition sm:min-h-28',
    dayStatusClassName(calendarDay.status, isSelected),
    isDisabled ? 'cursor-not-allowed opacity-55' : 'hover:-translate-y-0.5 hover:shadow-sm',
  ].join(' ')

  return (
    <button
      type="button"
      aria-label={`${longDateFormatter.format(calendarDay.date)}: ${dayStatusLabel(calendarDay)}`}
      aria-pressed={isSelected}
      className={buttonClassName}
      disabled={isDisabled}
      onClick={() => onDateToggle(calendarDay)}
    >
      <span className="text-sm font-semibold text-slate-950">{calendarDay.date.getDate()}</span>
      <span className={dayStatusBadgeClassName(calendarDay.status)}>{dayStatusLabel(calendarDay)}</span>
    </button>
  )
}

type TimeSlotPickerProps = {
  availableTimeSlots: readonly TimeSlot[]
  bookingDraft: BookingDraft
  onTimeSlotToggle: (timeSlot: TimeSlot) => void
  selectedDate: Date | null
}

function TimeSlotPicker({
  availableTimeSlots,
  bookingDraft,
  onTimeSlotToggle,
  selectedDate,
}: TimeSlotPickerProps) {
  if (selectedDate === null) {
    return <EmptyState label="No date selected" />
  }

  if (availableTimeSlots.length === 0) {
    return <EmptyState label="No available times on this date" />
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {availableTimeSlots.map((timeSlot) => {
        const isSelected = bookingDraft.timeSlot === timeSlot
        const className = [
          'flex min-h-16 flex-col items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold transition',
          isSelected
            ? 'border-blue-700 bg-blue-700 text-white shadow-sm'
            : 'border-slate-200 bg-slate-50 text-slate-900 hover:border-blue-300 hover:bg-blue-50',
        ].join(' ')

        return (
          <button
            type="button"
            aria-pressed={isSelected}
            className={className}
            key={timeSlot}
            onClick={() => onTimeSlotToggle(timeSlot)}
          >
            <span>{timeSlot}</span>
            <span className="text-xs font-medium opacity-75">Available</span>
          </button>
        )
      })}
    </div>
  )
}

type EmptyStateProps = {
  label: string
}

function EmptyState({ label }: EmptyStateProps) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-sm font-medium text-slate-500">
      {label}
    </div>
  )
}

type ContactFieldsProps = {
  bookingDraft: BookingDraft
  onDraftFieldChange: (fieldName: 'fullName' | 'phoneNumber', value: string) => void
}

function ContactFields({ bookingDraft, onDraftFieldChange }: ContactFieldsProps) {
  const phoneNumberHasInvalidCharacters = hasNonNumericalInput(bookingDraft.phoneNumber)
  const phoneInputClassName = [
    'h-12 w-full rounded-md border bg-white py-2 pl-10 pr-3 text-base font-medium outline-none transition placeholder:text-slate-400',
    phoneNumberHasInvalidCharacters
      ? 'border-rose-400 text-rose-700 focus:border-rose-500 focus:ring-4 focus:ring-rose-100'
      : 'border-slate-300 text-slate-950 focus:border-blue-600 focus:ring-4 focus:ring-blue-100',
  ].join(' ')

  return (
    <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Full name
        <span className="relative">
          <Lucide.User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            autoComplete="name"
            className="h-12 w-full rounded-md border border-slate-300 bg-white py-2 pl-10 pr-3 text-base font-medium text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            placeholder="Full name"
            value={bookingDraft.fullName}
            onChange={(event) => onDraftFieldChange('fullName', event.target.value)}
          />
        </span>
      </label>

      <label className="grid gap-2 text-sm font-semibold text-slate-700">
        Phone number
        <span className="relative">
          <Lucide.Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-invalid={phoneNumberHasInvalidCharacters}
            aria-describedby={phoneNumberHasInvalidCharacters ? 'phone-number-error' : undefined}
            className={phoneInputClassName}
            placeholder="Phone number"
            value={bookingDraft.phoneNumber}
            onChange={(event) => onDraftFieldChange('phoneNumber', event.target.value)}
          />
        </span>
        {phoneNumberHasInvalidCharacters && (
          <span className="text-sm font-medium text-rose-700" id="phone-number-error">
            Only numerical input is allowed.
          </span>
        )}
      </label>
    </div>
  )
}

type ReviewScreenProps = {
  bookingDraft: BookingDraft
  onBack: () => void
  onSubmit: () => void
}

function ReviewScreen({ bookingDraft, onBack, onSubmit }: ReviewScreenProps) {
  const selectedDateLabel =
    bookingDraft.dateKey === null ? 'No date selected' : longDateFormatter.format(dateFromDateKey(bookingDraft.dateKey))

  return (
    <section className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Confirm appointment</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{selectedDateLabel}</h2>
      </div>

      <dl className="grid gap-3">
        <DetailItem label="Time" value={bookingDraft.timeSlot ?? 'No time selected'} />
        <DetailItem label="Full name" value={bookingDraft.fullName.trim()} />
        <DetailItem label="Phone number" value={bookingDraft.phoneNumber.trim()} />
      </dl>

      <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-between">
        <button
          type="button"
          className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={onBack}
        >
          <Lucide.ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          onClick={onSubmit}
        >
          Book it
        </button>
      </div>
    </section>
  )
}

type DetailItemProps = {
  label: string
  value: string
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-950">{value}</dd>
    </div>
  )
}

type ResultScreenProps = {
  bookingDraft: BookingDraft
  onCancelAppointment: () => void
  submissionResult: SubmissionResult
}

function ResultScreen({ bookingDraft, onCancelAppointment, submissionResult }: ResultScreenProps) {
  const isSuccess = submissionResult === 'success'
  const isCanceled = submissionResult === 'canceled'
  const selectedDateLabel =
    bookingDraft.dateKey === null ? 'No date selected' : longDateFormatter.format(dateFromDateKey(bookingDraft.dateKey))

  return (
    <section className="grid justify-items-center gap-5 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div
        className={[
          'flex h-16 w-16 items-center justify-center rounded-full',
          isSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
        ].join(' ')}
      >
        {isSuccess ? <Lucide.Check className="h-9 w-9" /> : <Lucide.X className="h-9 w-9" />}
      </div>

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">
          {isSuccess ? 'Appointment saved' : isCanceled ? 'Appointment canceled' : 'Appointment unavailable'}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">{selectedDateLabel}</h2>
        <p className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
          {bookingDraft.timeSlot ?? 'No time selected'}
        </p>
        <p className="mt-3 text-base font-medium text-slate-600">{bookingDraft.fullName.trim()}</p>
      </div>

      {isSuccess && (
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
          onClick={onCancelAppointment}
        >
          Cancel appointment
        </button>
      )}
    </section>
  )
}

function buildCalendarDays(visibleMonth: Date, appointments: readonly Appointment[]): CalendarDay[] {
  const firstVisibleDate = firstCalendarDate(visibleMonth)

  return Array.from({ length: 42 }, (_, dayIndex) => {
    const date = new Date(
      firstVisibleDate.getFullYear(),
      firstVisibleDate.getMonth(),
      firstVisibleDate.getDate() + dayIndex,
    )
    const dateKey = dateKeyFromDate(date)
    const isVisibleMonth = date.getMonth() === visibleMonth.getMonth()
    const scheduledTimeSlots = scheduledTimeSlotsForDate(date)
    const availableTimeSlots = availableTimeSlotsForDate(date, appointments)

    return {
      date,
      dateKey,
      status: dayStatusForDate(date, isVisibleMonth, scheduledTimeSlots, availableTimeSlots),
      availableCount: availableTimeSlots.length,
      scheduledCount: scheduledTimeSlots.length,
    }
  })
}

function dayStatusForDate(
  date: Date,
  isVisibleMonth: boolean,
  scheduledTimeSlots: readonly TimeSlot[],
  availableTimeSlots: readonly TimeSlot[],
): DayStatus {
  if (!isVisibleMonth) {
    return 'outside'
  }

  if (isPastDate(date)) {
    return 'past'
  }

  if (scheduledTimeSlots.length === 0) {
    return 'closed'
  }

  return availableTimeSlots.length === 0 ? 'full' : 'available'
}

function firstCalendarDate(visibleMonth: Date): Date {
  const firstMonthDate = startOfMonth(visibleMonth)
  return new Date(
    firstMonthDate.getFullYear(),
    firstMonthDate.getMonth(),
    firstMonthDate.getDate() - firstMonthDate.getDay(),
  )
}

function chunkCalendarWeeks(calendarDays: readonly CalendarDay[]): CalendarDay[][] {
  return [0, 7, 14, 21, 28, 35].map((startIndex) => calendarDays.slice(startIndex, startIndex + 7))
}

function scheduledTimeSlotsForDate(date: Date): readonly TimeSlot[] {
  return WEEKLY_SCHEDULE[date.getDay() as Weekday]
}

function availableTimeSlotsForDate(date: Date, appointments: readonly Appointment[]): TimeSlot[] {
  if (isPastDate(date)) {
    return []
  }

  const reservedTimeSlots = reservedTimeSlotsForDate(date, appointments)
  return scheduledTimeSlotsForDate(date).filter((timeSlot) => !reservedTimeSlots.has(timeSlot))
}

function reservedTimeSlotsForDate(date: Date, appointments: readonly Appointment[]): ReadonlySet<TimeSlot> {
  const dateKey = dateKeyFromDate(date)
  const locallyBookedTimeSlots = appointments
    .filter((appointment) => appointment.dateKey === dateKey)
    .map((appointment) => appointment.timeSlot)

  return new Set([...seededBookedTimeSlotsForDate(date), ...locallyBookedTimeSlots])
}

function seededBookedTimeSlotsForDate(date: Date): readonly TimeSlot[] {
  const scheduledTimeSlots = scheduledTimeSlotsForDate(date)
  const dayOfMonth = date.getDate()
  const fullDemoDay = dayOfMonth % 13 === 0
  const partlyBookedDemoDay = dayOfMonth % 5 === 0

  if (fullDemoDay) {
    return scheduledTimeSlots
  }

  return partlyBookedDemoDay ? scheduledTimeSlots.slice(0, 2) : []
}

function dayStatusClassName(dayStatus: DayStatus, isSelected: boolean): string {
  const selectedClassName = isSelected ? 'ring-2 ring-blue-700 ring-offset-2' : ''
  const statusClassNames: Record<DayStatus, string> = {
    available: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    closed: 'border-slate-200 bg-slate-50 text-slate-500',
    full: 'border-rose-200 bg-rose-50 text-rose-950',
    outside: 'border-slate-100 bg-slate-50 text-slate-300',
    past: 'border-slate-200 bg-slate-100 text-slate-400',
  }

  return [statusClassNames[dayStatus], selectedClassName].join(' ')
}

function dayStatusBadgeClassName(dayStatus: DayStatus): string {
  const statusClassNames: Record<DayStatus, string> = {
    available: 'rounded bg-white/80 px-1.5 py-0.5 text-xs font-semibold text-emerald-700',
    closed: 'rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-500',
    full: 'rounded bg-white/80 px-1.5 py-0.5 text-xs font-semibold text-rose-700',
    outside: 'rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-300',
    past: 'rounded bg-white px-1.5 py-0.5 text-xs font-semibold text-slate-400',
  }

  return statusClassNames[dayStatus]
}

function dayStatusLabel(calendarDay: CalendarDay): string {
  const statusLabels: Record<DayStatus, string> = {
    available: `${calendarDay.availableCount} slots`,
    closed: 'Closed',
    full: 'Full',
    outside: '',
    past: 'Past',
  }

  return statusLabels[calendarDay.status]
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isPastDate(date: Date): boolean {
  return startOfDay(date).getTime() < startOfDay(new Date()).getTime()
}

function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function isValidFullName(fullName: string): boolean {
  return fullName.trim().split(/\s+/).join(' ').length >= 2
}

function isValidPhoneNumber(phoneNumber: string): boolean {
  return /^\d{7,}$/.test(phoneNumber.trim())
}

function hasNonNumericalInput(phoneNumber: string): boolean {
  return /\D/.test(phoneNumber.trim())
}

function loadStoredAppointments(): Appointment[] {
  const storedValue = window.localStorage.getItem(APPOINTMENTS_STORAGE_KEY)
  return storedValue === null ? [] : (JSON.parse(storedValue) as Appointment[])
}

function saveStoredAppointments(appointments: readonly Appointment[]) {
  window.localStorage.setItem(APPOINTMENTS_STORAGE_KEY, JSON.stringify(appointments))
}

function loadStoredBookingDraft(): BookingDraft {
  const storedValue = window.localStorage.getItem(BOOKING_DRAFT_STORAGE_KEY)
  return storedValue === null ? EMPTY_BOOKING_DRAFT : (JSON.parse(storedValue) as BookingDraft)
}

export default App
