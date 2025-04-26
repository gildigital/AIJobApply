import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { demographicQuestionsSchema, DemographicQuestions as DemographicQuestionsType } from "@shared/schema";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

interface DemographicQuestionsProps {
  onSubmit: (data: DemographicQuestionsType) => void;
  onBack: () => void;
  isLoading: boolean;
}

export default function DemographicQuestions({ onSubmit, onBack, isLoading }: DemographicQuestionsProps) {
  const form = useForm<DemographicQuestionsType>({
    resolver: zodResolver(demographicQuestionsSchema),
    defaultValues: {
      gender: [],
      genderSelfDescribe: "",
      veteranStatus: "",
      race: [],
      sexualOrientation: [],
      transgender: "no_answer",
      disability: "no_answer",
    },
  });

  const watchGender = form.watch("gender");
  const showGenderSelfDescribe = watchGender?.includes("self_describe");

  return (
    <>
      <CardHeader>
        <CardTitle>Optional Demographic Information</CardTitle>
        <CardDescription>
          These questions are optional and used for equal opportunity purposes only. Your answers won't affect your job applications.
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Gender Identity */}
            <FormField
              control={form.control}
              name="gender"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">How do you describe your gender identity?</FormLabel>
                    <FormDescription>
                      Select all that apply.
                    </FormDescription>
                  </div>
                  <div className="space-y-2">
                    {[
                      { id: "male", label: "Male" },
                      { id: "female", label: "Female" },
                      { id: "non_binary", label: "Non-binary" },
                      { id: "self_describe", label: "I prefer to self-describe" },
                      { id: "no_answer", label: "I prefer not to answer" },
                    ].map((option) => (
                      <FormField
                        key={option.id}
                        control={form.control}
                        name="gender"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={option.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value as string[], option.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== option.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Gender Self-Describe */}
            {showGenderSelfDescribe && (
              <FormField
                control={form.control}
                name="genderSelfDescribe"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Please describe your gender identity</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Veteran Status */}
            <FormField
              control={form.control}
              name="veteranStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Protected Veteran Status</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="protected_veteran">I identify as a protected veteran</SelectItem>
                      <SelectItem value="not_protected_veteran">I am not a protected veteran</SelectItem>
                      <SelectItem value="no_answer">I prefer not to answer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Race/Ethnicity */}
            <FormField
              control={form.control}
              name="race"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">How would you describe your racial/ethnic background?</FormLabel>
                    <FormDescription>
                      Select all that apply.
                    </FormDescription>
                  </div>
                  <div className="space-y-2">
                    {[
                      { id: "white", label: "White" },
                      { id: "black", label: "Black or African American" },
                      { id: "hispanic", label: "Hispanic or Latino" },
                      { id: "asian", label: "Asian" },
                      { id: "native", label: "Native American or Alaska Native" },
                      { id: "pacific", label: "Native Hawaiian or Pacific Islander" },
                      { id: "no_answer", label: "I prefer not to answer" },
                    ].map((option) => (
                      <FormField
                        key={option.id}
                        control={form.control}
                        name="race"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={option.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value as string[], option.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== option.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sexual Orientation */}
            <FormField
              control={form.control}
              name="sexualOrientation"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">How would you describe your sexual orientation?</FormLabel>
                    <FormDescription>
                      Select all that apply.
                    </FormDescription>
                  </div>
                  <div className="space-y-2">
                    {[
                      { id: "straight", label: "Straight/Heterosexual" },
                      { id: "gay", label: "Gay" },
                      { id: "lesbian", label: "Lesbian" },
                      { id: "bisexual", label: "Bisexual" },
                      { id: "asexual", label: "Asexual" },
                      { id: "other", label: "Other" },
                      { id: "no_answer", label: "I prefer not to answer" },
                    ].map((option) => (
                      <FormField
                        key={option.id}
                        control={form.control}
                        name="sexualOrientation"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={option.id}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(option.id)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...field.value as string[], option.id])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== option.id
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal">
                                {option.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Transgender */}
            <FormField
              control={form.control}
              name="transgender"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Do you identify as transgender?</FormLabel>
                  <FormControl>
                    <RadioGroup 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="yes" />
                        </FormControl>
                        <FormLabel className="font-normal">Yes</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no" />
                        </FormControl>
                        <FormLabel className="font-normal">No</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no_answer" />
                        </FormControl>
                        <FormLabel className="font-normal">I prefer not to answer</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Disability */}
            <FormField
              control={form.control}
              name="disability"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Do you have a disability or chronic condition that substantially limits one or more major life activities?</FormLabel>
                  <FormControl>
                    <RadioGroup 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                      className="flex flex-col space-y-1"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="yes" />
                        </FormControl>
                        <FormLabel className="font-normal">Yes</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no" />
                        </FormControl>
                        <FormLabel className="font-normal">No</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="no_answer" />
                        </FormControl>
                        <FormLabel className="font-normal">I prefer not to answer</FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={onBack} disabled={isLoading}>
              Back
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Continue"}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </>
  );
}
