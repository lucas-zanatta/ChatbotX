import { DateTimeField } from "@/components/form/date-time-field"
import { InputField } from "@/components/form/input-field"
import { InputNumberField } from "@/components/form/input-number-field"
import { MultiSelectField, SelectField } from "@/components/form/select-field"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { dataTableConfig } from "@/config/data-table"
import {
  continentSelectOptions,
  countrySelectOptions,
  genderSelectOptions,
  languageSelectOptions,
} from "@/lib/country"
import { getFilterOperators } from "@/lib/data-table"
import type { FilterOperator, FilterVariant } from "@/types/data-table"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState, useEffect } from "react"
import { Form, useFieldArray, useForm, useFormContext } from "react-hook-form"
import { z } from "zod"

const allAttributes: {
  value: string
  label: string
  variant: FilterVariant
  options?: {
    value: string
    label: string
  }[]
}[] = [
  {
    value: "language",
    label: "Language",
    variant: "multiSelect",
    options: languageSelectOptions,
  },
  {
    value: "fullName",
    label: "Full Name",
    variant: "text",
  },
  {
    value: "country",
    label: "Country",
    variant: "multiSelect",
    options: countrySelectOptions,
  },
  {
    value: "continent",
    label: "Continent",
    variant: "multiSelect",
    options: continentSelectOptions,
  },
  {
    value: "gender",
    label: "Gender",
    variant: "select",
    options: genderSelectOptions,
  },
  {
    value: "subscribedToBroadcasts",
    label: "Subscribed to broadcasts",
    variant: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    value: "contactCreated",
    label: "Contact created",
    variant: "date",
  },
  {
    value: "contactCreatedDiffMinutes",
    label: "Contact created in diff",
    variant: "number",
  },
  {
    value: "source",
    label: "Source",
    variant: "multiSelect",
  },
]

const filterContactOptions = [
  {
    value: "AND",
    label: "All of the following conditions",
  },
  {
    value: "OR",
    label: "Any of the below conditions.",
  },
]

const filterContactRowSchema = z.object({
  attribute: z.enum(allAttributes.map((f) => f.value) as [string, ...string[]]),
  operator: z.enum(dataTableConfig.operators),
  value: z.union([z.string(), z.array(z.string())]).nullable(),
})
type FilterContactRowSchema = z.infer<typeof filterContactRowSchema>

export function ContactFilterManage({
  parentName,
}: {
  parentName: string
}) {
  const [openContactFilterModal, setOpenContactFilterModal] = useState(false)

  const { control } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.conditions`,
  })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SelectField
          name="contactFilter.joinOperator"
          label="Only contacts, that match to"
          options={filterContactOptions}
        />

        {(fields as unknown as FilterContactRowSchema[]).map((item, index) => {
          const condition = allAttributes.find(
            (c) => c.value === item.attribute,
          )

          return condition ? (
            <div
              key={`${item.attribute}-${index}`}
              className="flex items-center"
            >
              <Button asChild variant="ghost" onClick={() => console.log(123)}>
                <div className="flex-1 flex gap-1 overflow-hidden justify-start">
                  <span>{condition.label}</span>
                  <span className="italic">{item.operator}</span>
                  <span>
                    {Array.isArray(item.value)
                      ? item.value.join(", ")
                      : item.value}
                  </span>
                </div>
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => remove(index)}
                type="button"
              >
                <Trash2Icon />
              </Button>
            </div>
          ) : null
        })}

        <ContactFilterRowModal
          open={openContactFilterModal}
          setOpen={setOpenContactFilterModal}
          addNewRow={(val) => append(val)}
        />
      </div>
    </div>
  )
}

function ContactFilterRowModal({
  open,
  setOpen,
  addNewRow,
}: {
  open: boolean
  setOpen: (val: boolean) => void
  addNewRow: (val: FilterContactRowSchema) => void
}) {
  const defaultValues: FilterContactRowSchema = {
    attribute: "language",
    operator: "eq",
    value: "",
  }

  const form = useForm<FilterContactRowSchema>({
    defaultValues,
  })

  const onSubmit = () => {
    addNewRow(form.getValues())
    setOpen(false)
    form.reset(defaultValues)
  }

  const onCancel = () => {
    form.reset(defaultValues)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <PlusIcon />
          Condition
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle />
          <DialogDescription />
        </DialogHeader>

        <Form {...form}>
          <form
            className="flex flex-col space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              onSubmit()
              e.stopPropagation()
            }}
          >
            <ContactFilterRow />

            {/* <div className="space-y-4">
          <div className="space-y-2">
            {/* {JSON.stringify(contactFilterConfig)}

        {fields.map((item, index) => {
          const condition = contactFilterConfig.find((c) => c.key === item.key)

          return condition
            ? <div key={`${item.id}-${index}`} className="flex items-center">
              <div className="flex-1 flex gap-1 overflow-hidden" onClick={ }>
                <span>{condition.label}</span>
                <span className="italic">{filterOperatorLabels[item.condition]}</span>
                <span>{item.value}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => remove(index)}
                type="button"
              >
                <Trash2Icon />
              </Button>
            </div>
            : null
          // <ContactFilterRow key={item.id} index={index} remove={remove} />
        })}
      </div>

      <Button onClick={onAdd} variant="outline" type="button">
        <PlusCircleIcon className="mr-2 h-4 w-4" />
        Add condition
      </Button>
    </div> */}

            <DialogFooter className="sm:justify-end">
              <DialogClose asChild>
                <Button type="button" variant="link" onClick={onCancel}>
                  Close
                </Button>
              </DialogClose>
              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
              >
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}

function ContactFilterRow() {
  const { setValue, watch } = useFormContext()

  // const { watch, setValue } = useFormContext()
  const attribute = watch("attribute")
  const operator = watch("operator")
  const [allOperators, setAllOperators] = useState<
    {
      label: string
      value: FilterOperator
    }[]
  >([])

  useEffect(() => {
    const targetAttribute = allAttributes.find((a) => a.value === attribute)

    if (targetAttribute) {
      const operators = getFilterOperators(targetAttribute.variant)
      setAllOperators(operators)

      if (operators.length > 0) {
        console.log("operators[0].value", operators[0].value)
        setValue("operator", operators[0].value)
      }
    } else {
      setAllOperators([])
      setValue("operator", "eq")
    }
  }, [attribute, setValue])

  const renderValueInput = () => {
    if (["isEmpty", "isNotEmpty"].includes(operator)) {
      return <div> </div>
    }

    const targetAttribute = allAttributes.find((a) => a.value === attribute)
    if (!targetAttribute) return <div> </div>

    switch (targetAttribute.variant) {
      case "text":
        return <InputField isRequired={true} name={"value"} label="Value" />
      case "select":
        return (
          <SelectField
            isRequired={true}
            name="value"
            label="Value"
            options={targetAttribute.options ?? []}
          />
        )
      case "multiSelect":
        return (
          <MultiSelectField
            isRequired={true}
            name="value"
            label="Value"
            options={targetAttribute.options ?? []}
          />
        )
      case "date":
        return <DateTimeField isRequired={true} name="value" label="Value" />
      case "number":
        return <InputNumberField isRequired={true} name="value" label="Value" />
      default:
        return <div> </div>
    }
  }

  return (
    <div className="flex space-x-2">
      <SelectField
        isRequired={true}
        label="Attribute"
        name="attribute"
        options={allAttributes}
      />

      <SelectField
        isRequired={true}
        label="Operator"
        name="operator"
        options={allOperators}
      />

      {renderValueInput()}
    </div>
  )
}
