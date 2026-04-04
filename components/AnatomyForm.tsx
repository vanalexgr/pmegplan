"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus, RotateCcw, Trash2, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

import { useLiveConflict } from "@/lib/hooks/useLiveConflict";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ALL_DEVICES } from "@/lib/devices";
import { isValidClockText, normalizeClockText } from "@/lib/planning/clock";
import type { Fenestration, FenestrationType } from "@/lib/types";
import { caseSchema, type CaseFormValues } from "@/lib/validation";

function getDefaultFenestration(nextIndex: number): Fenestration {
  const defaults: Fenestration[] = [
    {
      vessel: "CELIAC",
      ftype: "SCALLOP",
      clock: "12:00",
      depthMm: 0,
      widthMm: 20,
      heightMm: 20,
    },
    {
      vessel: "SMA",
      ftype: "LARGE_FEN",
      clock: "12:30",
      depthMm: 12,
      widthMm: 8,
      heightMm: 8,
    },
    {
      vessel: "RRA",
      ftype: "SMALL_FEN",
      clock: "9:30",
      depthMm: 33,
      widthMm: 6,
      heightMm: 6,
    },
    {
      vessel: "LRA",
      ftype: "SMALL_FEN",
      clock: "2:30",
      depthMm: 35,
      widthMm: 6,
      heightMm: 8,
    },
  ];

  return defaults[nextIndex] ?? defaults.at(-1)!;
}

function getDimensionsForType(type: FenestrationType) {
  switch (type) {
    case "SCALLOP":
      return { widthMm: 20, heightMm: 20 };
    case "LARGE_FEN":
      return { widthMm: 8, heightMm: 8 };
    default:
      return { widthMm: 6, heightMm: 6 };
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-[#b42318]">{message}</p>;
}

interface AnatomyFormProps {
  initialValue: CaseFormValues;
  selectedDeviceIds: string[];
  onSubmit: (values: CaseFormValues) => void;
  onToggleDevice: (deviceId: string) => void;
  onSelectAllDevices: () => void;
  onLoadSample: () => void;
  isPending?: boolean;
}

export function AnatomyForm({
  initialValue,
  selectedDeviceIds,
  onSubmit,
  onToggleDevice,
  onSelectAllDevices,
  onLoadSample,
  isPending = false,
}: AnatomyFormProps) {
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<CaseFormValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: initialValue,
  });

  useEffect(() => {
    reset(initialValue);
  }, [initialValue, reset]);

  const { fields, append, remove } = useFieldArray({
    control,
    name: "fenestrations",
  });
  const watchedCase = useWatch({
    control,
  }) as CaseFormValues;

  const liveConflict = useLiveConflict(watchedCase, selectedDeviceIds);

  const normalizeClockField = (index: number, rawValue: string) => {
    if (!isValidClockText(rawValue)) {
      return;
    }

    setValue(
      `fenestrations.${index}.clock`,
      normalizeClockText(rawValue, { separator: ":", padHour: false }),
      {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      },
    );
  };

  return (
    <form
      className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]"
      onSubmit={handleSubmit(onSubmit)}
    >
      <Card>
        <CardHeader>
          <CardTitle>Anatomy input</CardTitle>
          <CardDescription>
            Enter neck diameter and up to four target vessels. Clock positions
            follow Cook CMD convention, viewed from caudal to cranial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="neckDiameterMm">Aortic neck diameter (mm)</Label>
              <Input
                id="neckDiameterMm"
                type="number"
                step="0.1"
                {...register("neckDiameterMm", { valueAsNumber: true })}
              />
              <FieldError message={errors.neckDiameterMm?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="patientId">Patient ID</Label>
              <Input id="patientId" placeholder="Optional" {...register("patientId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="surgeonName">Surgeon</Label>
              <Input
                id="surgeonName"
                placeholder="Optional"
                {...register("surgeonName")}
              />
            </div>
            <div className="space-y-2">
              <Label>Fenestration count</Label>
              <div className="flex h-11 items-center rounded-2xl border border-[color:var(--border)] bg-white px-4 text-sm text-[color:var(--muted-foreground)]">
                {fields.length} target vessel{fields.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => {
              const currentType = watchedCase?.fenestrations?.[index]?.ftype ?? field.ftype;
              const isScallop = currentType === "SCALLOP";
              const clockField = register(`fenestrations.${index}.clock`);
              const conflictData = liveConflict?.perFenestration?.[index];
              return (
                <div
                  key={field.id}
                  className="space-y-4 rounded-[24px] border border-[color:var(--border)] bg-[rgba(255,255,255,0.62)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[color:var(--foreground)]">
                        Fenestration {index + 1}
                      </p>
                      <p className="text-xs text-[color:var(--muted-foreground)]">
                        Vessel target and punch geometry
                      </p>
                    </div>
                    {fields.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="mr-2 size-4" />
                        Remove
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Vessel</Label>
                      <Select {...register(`fenestrations.${index}.vessel`)}>
                        <option value="SMA">SMA</option>
                        <option value="LRA">Left renal</option>
                        <option value="RRA">Right renal</option>
                        <option value="CELIAC">Celiac</option>
                        <option value="LMA">IMA / LMA</option>
                        <option value="CUSTOM">Custom</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Fenestration type</Label>
                      <Select
                        value={currentType}
                        onChange={(event) => {
                          const nextType = event.target.value as FenestrationType;
                          const nextDimensions = getDimensionsForType(nextType);
                          setValue(`fenestrations.${index}.ftype`, nextType, {
                            shouldValidate: true,
                          });
                          setValue(
                            `fenestrations.${index}.widthMm`,
                            nextDimensions.widthMm,
                            { shouldValidate: true },
                          );
                          setValue(
                            `fenestrations.${index}.heightMm`,
                            nextDimensions.heightMm,
                            { shouldValidate: true },
                          );
                          if (nextType === "SCALLOP") {
                            setValue(`fenestrations.${index}.depthMm`, 0, {
                              shouldValidate: true,
                            });
                          }
                        }}
                      >
                        <option value="SCALLOP">Scallop</option>
                        <option value="LARGE_FEN">Large fenestration</option>
                        <option value="SMALL_FEN">Small fenestration</option>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Clock position</Label>
                        {!isScallop && conflictData ? (
                          conflictData.conflict ? (
                            <span className="flex items-center text-xs conflict-indicator-conflict gap-1 font-medium">
                              <AlertCircle className="size-3" />
                              Strut conflict
                            </span>
                          ) : (
                            <span className="flex items-center text-xs conflict-indicator-clear gap-1 font-medium">
                              <CheckCircle2 className="size-3" />
                              Clear
                            </span>
                          )
                        ) : !isScallop && !conflictData && watchedCase?.neckDiameterMm ? (
                          <span className="flex items-center text-xs text-muted-foreground gap-1">
                            <Loader2 className="size-3 animate-spin" />
                            Checking...
                          </span>
                        ) : null}
                      </div>
                      <Input
                        placeholder="3:45"
                        {...clockField}
                        onBlur={(event) => {
                          clockField.onBlur(event);
                          normalizeClockField(index, event.target.value);
                        }}
                      />
                      <FieldError
                        message={errors.fenestrations?.[index]?.clock?.message}
                      />
                    </div>
                    {isScallop ? (
                      <div className="space-y-2">
                        <Label>Depth from proximal edge (mm)</Label>
                        <div className="flex h-11 items-center rounded-2xl border border-[color:var(--border)] bg-[rgba(255,255,255,0.72)] px-4 text-sm text-[color:var(--muted-foreground)]">
                          Scallops sit at the proximal edge by definition: 0.0 mm
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Depth from proximal edge (mm)</Label>
                        <Input
                          type="number"
                          step="0.1"
                          {...register(`fenestrations.${index}.depthMm`, {
                            valueAsNumber: true,
                          })}
                        />
                        <FieldError
                          message={errors.fenestrations?.[index]?.depthMm?.message}
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Width (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        {...register(`fenestrations.${index}.widthMm`, {
                          valueAsNumber: true,
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Height (mm)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        {...register(`fenestrations.${index}.heightMm`, {
                          valueAsNumber: true,
                        })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => append(getDefaultFenestration(fields.length))}
              disabled={fields.length >= 4}
            >
              <Plus className="mr-2 size-4" />
              Add vessel
            </Button>
            <Button type="button" variant="ghost" onClick={onLoadSample}>
              <RotateCcw className="mr-2 size-4" />
              Load sample case
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="surgeonNote">Surgeon note</Label>
            <Textarea
              id="surgeonNote"
              placeholder="Optional planning note for the export footer."
              {...register("surgeonNote")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device selection</CardTitle>
          <CardDescription>
            Compare any combination of the four infrarenal platforms included in
            the MVP database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {ALL_DEVICES.map((device) => {
              const checked = selectedDeviceIds.includes(device.id);
              return (
                <label
                  key={device.id}
                  className="flex cursor-pointer items-start gap-3 rounded-[22px] border border-[color:var(--border)] bg-white/80 p-4"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleDevice(device.id)}
                    className="mt-1 size-4 rounded border-[color:var(--border)] text-[color:var(--brand)]"
                  />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[color:var(--foreground)]">
                        {device.shortName}
                      </span>
                      <span
                        className="inline-flex size-3 rounded-full"
                        style={{ backgroundColor: device.color }}
                      />
                    </div>
                    <p className="text-sm text-[color:var(--muted-foreground)]">
                      {device.manufacturer}
                    </p>
                    <p className="text-xs leading-5 text-[color:var(--muted-foreground)]">
                      {device.pmegNotes}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="rounded-[22px] border border-dashed border-[color:var(--border)] bg-[rgba(255,255,255,0.56)] p-4 text-sm text-[color:var(--muted-foreground)]">
            {selectedDeviceIds.length === 0
              ? "Select at least one device to run the planner."
              : `${selectedDeviceIds.length} device platform${selectedDeviceIds.length === 1 ? "" : "s"} selected.`}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={onSelectAllDevices}>
              Enable all
            </Button>
            <Button type="submit" disabled={isPending || selectedDeviceIds.length === 0}>
              {isPending ? "Analysing..." : "Run planning analysis"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
