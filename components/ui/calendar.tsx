"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { ko } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={ko}
      className={cn("p-3 bg-[#111] text-white", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        month_caption: "flex justify-center py-2 relative items-center mb-4",
        caption_label: "text-sm font-bold text-white",
        nav: "flex items-center",
        button_previous: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-white/10 hover:text-white absolute left-2"
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-white/10 hover:text-white absolute right-2"
        ),
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "flex",
        weekday: "text-white/40 rounded-md w-9 font-normal text-[0.8rem]",
        week: "flex w-full mt-2",
        day: cn(
           buttonVariants({ variant: "ghost" }),
           "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-white/20 hover:text-white"
        ),
        day_button: "h-9 w-9 p-0 font-normal",
        range_start: "day-range-start bg-white text-black hover:bg-white hover:text-black",
        range_end: "day-range-end bg-white text-black hover:bg-white hover:text-black",
        selected: "bg-white text-black hover:bg-white hover:text-black focus:bg-white focus:text-black",
        today: "bg-white/10 text-white font-bold",
        outside: "day-outside text-white/20 opacity-50 aria-selected:bg-white/5 aria-selected:text-white/20 aria-selected:opacity-30",
        disabled: "text-white/20 opacity-50",
        range_middle: "aria-selected:bg-white/10 aria-selected:text-white",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ ...props }) => {
            if (props.orientation === "left") return <ChevronLeft className="h-4 w-4" />
            return <ChevronRight className="h-4 w-4" />
        }
      }}
      {...props}
    />
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
