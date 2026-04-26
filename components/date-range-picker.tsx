"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps {
  className?: string;
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
}

export function DatePickerWithRange({
  className,
  date,
  setDate
}: DatePickerWithRangeProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[280px] justify-start text-left font-normal bg-gray-50 border-gray-200 hover:bg-gray-50 hover:text-gray-900 rounded-xl h-[42px]",
              !date && "text-gray-400"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 opacity-50" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "yyyy.MM.dd")} -{" "}
                  {format(date.to, "yyyy.MM.dd")}
                </>
              ) : (
                format(date.from, "yyyy.MM.dd")
              )
            ) : (
              <span>날짜 범위를 선택하세요</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 border-gray-200" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
