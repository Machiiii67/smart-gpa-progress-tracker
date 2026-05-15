import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Plus,
  RefreshCcw,
  Save,
  SlidersHorizontal,
  Target,
  Trash2,
} from "lucide-react";

const STORAGE_KEY = "smart-gpa-progress-tracker:v1";

const defaultConversionTable = [
  { id: "grade-a", label: "A", minPercentage: 93, gpa: 4 },
  { id: "grade-a-minus", label: "A-", minPercentage: 90, gpa: 3.7 },
  { id: "grade-b-plus", label: "B+", minPercentage: 87, gpa: 3.3 },
  { id: "grade-b", label: "B", minPercentage: 83, gpa: 3 },
  { id: "grade-b-minus", label: "B-", minPercentage: 80, gpa: 2.7 },
  { id: "grade-c-plus", label: "C+", minPercentage: 77, gpa: 2.3 },
  { id: "grade-c", label: "C", minPercentage: 73, gpa: 2 },
  { id: "grade-c-minus", label: "C-", minPercentage: 70, gpa: 1.7 },
  { id: "grade-d", label: "D", minPercentage: 60, gpa: 1 },
  { id: "grade-f", label: "F", minPercentage: 0, gpa: 0 },
];

const initialData = {
  program: {
    majorName: "Computer Science",
    totalCredits: 120,
    completedCredits: 54,
    currentGpa: 3.18,
    targetGpa: 3.5,
    gradingScale: "percentage",
  },
  courses: [
    {
      id: "course-sample",
      name: "Data Structures",
      credits: 3,
      targetPercentage: 80,
      targetGpa: 3.2,
      components: [
        { id: "attendance", name: "Attendance", weight: 10, score: 95, completed: true },
        { id: "assignment", name: "Assignment", weight: 25, score: 84, completed: true },
        { id: "quiz", name: "Quiz", weight: 15, score: 78, completed: false },
        { id: "midterm", name: "Midterm", weight: 20, score: 0, completed: false },
        { id: "final", name: "Final", weight: 30, score: 0, completed: false },
      ],
      scenarioScores: {
        quiz: 82,
        midterm: 80,
        final: 85,
      },
    },
  ],
  conversionTable: defaultConversionTable,
};

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function useLocalStorage(key, fallbackValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallbackValue;
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function percentageToGpa(percentage, table) {
  const sorted = [...table].sort((a, b) => Number(b.minPercentage) - Number(a.minPercentage));
  const matched = sorted.find((row) => percentage >= Number(row.minPercentage));
  return clampNumber(matched?.gpa ?? 0, 0, 4);
}

function calculateCourse(course, conversionTable) {
  const components = course.components ?? [];
  const totalWeight = components.reduce((sum, component) => sum + clampNumber(component.weight, 0, 1000), 0);
  const completed = components.filter((component) => component.completed);
  const remaining = components.filter((component) => !component.completed);

  // Completed work is already secured, so each component contributes score * weight as its final-course share.
  const securedScore = completed.reduce((sum, component) => {
    return sum + (clampNumber(component.score, 0, 100) * clampNumber(component.weight, 0, 1000)) / 100;
  }, 0);

  const remainingWeight = remaining.reduce((sum, component) => sum + clampNumber(component.weight, 0, 1000), 0);
  const targetPercentage = clampNumber(course.targetPercentage, 0, 100);

  // Required average is normalized back to a 0-100 score across unfinished weighted work.
  const requiredAverage =
    remainingWeight > 0 ? ((targetPercentage - securedScore) / remainingWeight) * 100 : 0;
  const targetAchievable =
    remainingWeight === 0 ? securedScore >= targetPercentage : requiredAverage <= 100;
  const targetAlreadyMet = securedScore >= targetPercentage;

  const scenarioFinal = components.reduce((sum, component) => {
    const score = component.completed
      ? component.score
      : course.scenarioScores?.[component.id] ?? component.score ?? 0;
    return sum + (clampNumber(score, 0, 100) * clampNumber(component.weight, 0, 1000)) / 100;
  }, 0);

  const predictedPercentage = remainingWeight === 0 ? securedScore : scenarioFinal;
  const predictedGpa = percentageToGpa(predictedPercentage, conversionTable);

  return {
    totalWeight,
    securedScore,
    remainingWeight,
    requiredAverage,
    oneRemainingRequired: remaining.length === 1 ? requiredAverage : null,
    targetAchievable,
    targetAlreadyMet,
    predictedPercentage,
    predictedGpa,
    remaining,
  };
}

function calculateOverallImpact(program, courseGpa, courseCredits) {
  const completedCredits = clampNumber(program.completedCredits, 0, 1000);
  const currentGpa = clampNumber(program.currentGpa, 0, 4);
  const credits = clampNumber(courseCredits, 0, 1000);
  const totalCredits = completedCredits + credits;

  // Overall impact uses standard credit-weighted GPA points before and after adding the course.
  if (totalCredits === 0) return currentGpa;
  return ((currentGpa * completedCredits) + (courseGpa * credits)) / totalCredits;
}

function Field({ label, children }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
    />
  );
}

function NumberInput({ min = 0, max, step = "0.01", ...props }) {
  return <TextInput type="number" min={min} max={max} step={step} {...props} />;
}

function SelectInput(props) {
  return (
    <select
      {...props}
      className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
    />
  );
}

function Stat({ label, value, tone = "default" }) {
  const tones = {
    default: "border-slate-200 bg-white text-slate-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-rose-200 bg-rose-50 text-rose-900",
    blue: "border-sky-200 bg-sky-50 text-sky-900",
  };

  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function IconButton({ children, className = "", title, ...props }) {
  return (
    <button
      {...props}
      title={title}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-teal-300 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function App() {
  const [data, setData] = useLocalStorage(STORAGE_KEY, initialData);
  const [selectedCourseId, setSelectedCourseId] = useState(data.courses?.[0]?.id);

  const courses = data.courses?.length ? data.courses : initialData.courses;
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? courses[0];
  const courseStats = useMemo(
    () => calculateCourse(selectedCourse, data.conversionTable),
    [selectedCourse, data.conversionTable],
  );
  const projectedOverall = calculateOverallImpact(
    data.program,
    courseStats.predictedGpa,
    selectedCourse.credits,
  );
  const targetOverallDelta = round(clampNumber(data.program.targetGpa, 0, 4) - projectedOverall);

  function updateProgram(field, value) {
    setData((current) => ({
      ...current,
      program: {
        ...current.program,
        [field]: value,
      },
    }));
  }

  function updateCourse(courseId, updater) {
    setData((current) => ({
      ...current,
      courses: current.courses.map((course) =>
        course.id === courseId ? { ...course, ...updater(course) } : course,
      ),
    }));
  }

  function updateSelectedCourse(field, value) {
    updateCourse(selectedCourse.id, () => ({ [field]: value }));
  }

  function addCourse() {
    const id = makeId("course");
    const newCourse = {
      id,
      name: "New Course",
      credits: 3,
      targetPercentage: 80,
      targetGpa: 3.2,
      components: [
        { id: makeId("component"), name: "Assignment", weight: 40, score: 0, completed: false },
        { id: makeId("component"), name: "Midterm", weight: 25, score: 0, completed: false },
        { id: makeId("component"), name: "Final", weight: 35, score: 0, completed: false },
      ],
      scenarioScores: {},
    };
    setData((current) => ({ ...current, courses: [...current.courses, newCourse] }));
    setSelectedCourseId(id);
  }

  function deleteCourse(courseId) {
    if (courses.length <= 1) return;
    const nextCourses = courses.filter((course) => course.id !== courseId);
    setData((current) => ({ ...current, courses: nextCourses }));
    setSelectedCourseId(nextCourses[0].id);
  }

  function addComponent() {
    const id = makeId("component");
    updateCourse(selectedCourse.id, (course) => ({
      components: [
        ...course.components,
        { id, name: "Component", weight: 0, score: 0, completed: false },
      ],
      scenarioScores: {
        ...course.scenarioScores,
        [id]: 0,
      },
    }));
  }

  function updateComponent(componentId, field, value) {
    updateCourse(selectedCourse.id, (course) => ({
      components: course.components.map((component) =>
        component.id === componentId ? { ...component, [field]: value } : component,
      ),
    }));
  }

  function removeComponent(componentId) {
    updateCourse(selectedCourse.id, (course) => {
      const { [componentId]: removed, ...scenarioScores } = course.scenarioScores ?? {};
      return {
        components: course.components.filter((component) => component.id !== componentId),
        scenarioScores,
      };
    });
  }

  function updateScenarioScore(componentId, value) {
    updateCourse(selectedCourse.id, (course) => ({
      scenarioScores: {
        ...course.scenarioScores,
        [componentId]: value,
      },
    }));
  }

  function updateConversionRow(rowId, field, value) {
    setData((current) => ({
      ...current,
      conversionTable: current.conversionTable.map((row) =>
        row.id === rowId ? { ...row, [field]: value } : row,
      ),
    }));
  }

  function addConversionRow() {
    setData((current) => ({
      ...current,
      conversionTable: [
        ...current.conversionTable,
        { id: makeId("grade"), label: "New", minPercentage: 0, gpa: 0 },
      ],
    }));
  }

  function deleteConversionRow(rowId) {
    if (data.conversionTable.length <= 1) return;
    setData((current) => ({
      ...current,
      conversionTable: current.conversionTable.filter((row) => row.id !== rowId),
    }));
  }

  function resetSampleData() {
    setData(initialData);
    setSelectedCourseId(initialData.courses[0].id);
  }

  const weightIsValid = Math.abs(courseStats.totalWeight - 100) < 0.01;
  const completionTone = courseStats.targetAlreadyMet
    ? "green"
    : courseStats.targetAchievable
      ? "blue"
      : "red";

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-slate-900">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                <GraduationCap className="h-4 w-4" />
                Student planning dashboard
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">
                Smart GPA Progress Tracker
              </h1>
            </div>
            <PrimaryButton onClick={resetSampleData} className="self-start bg-slate-900 hover:bg-slate-800">
              <RefreshCcw className="h-4 w-4" />
              Reset sample
            </PrimaryButton>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Current GPA" value={round(data.program.currentGpa)} tone="blue" />
            <Stat label="Target GPA" value={round(data.program.targetGpa)} />
            <Stat label="Course GPA" value={round(courseStats.predictedGpa)} tone="green" />
            <Stat label="Projected Overall" value={round(projectedOverall)} tone={targetOverallDelta <= 0 ? "green" : "amber"} />
            <Stat label="Credits Progress" value={`${round(data.program.completedCredits, 0)}/${round(data.program.totalCredits, 0)}`} />
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl min-w-0 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="grid min-w-0 content-start gap-6">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-teal-700" />
              <h2 className="text-lg font-bold">Program Overview</h2>
            </div>
            <div className="grid gap-4">
              <Field label="Major / program">
                <TextInput
                  value={data.program.majorName}
                  onChange={(event) => updateProgram("majorName", event.target.value)}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Required credits">
                  <NumberInput
                    value={data.program.totalCredits}
                    onChange={(event) =>
                      updateProgram("totalCredits", clampNumber(event.target.value, 0, 1000))
                    }
                  />
                </Field>
                <Field label="Completed credits">
                  <NumberInput
                    value={data.program.completedCredits}
                    onChange={(event) =>
                      updateProgram("completedCredits", clampNumber(event.target.value, 0, 1000))
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Current GPA">
                  <NumberInput
                    max={4}
                    value={data.program.currentGpa}
                    onChange={(event) =>
                      updateProgram("currentGpa", clampNumber(event.target.value, 0, 4))
                    }
                  />
                </Field>
                <Field label="Target GPA">
                  <NumberInput
                    max={4}
                    value={data.program.targetGpa}
                    onChange={(event) =>
                      updateProgram("targetGpa", clampNumber(event.target.value, 0, 4))
                    }
                  />
                </Field>
              </div>
              <Field label="Grading scale type">
                <SelectInput
                  value={data.program.gradingScale}
                  onChange={(event) => updateProgram("gradingScale", event.target.value)}
                >
                  <option value="percentage">Percentage</option>
                  <option value="gpa">4.0 GPA scale</option>
                </SelectInput>
              </Field>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-teal-700" />
                <h2 className="text-lg font-bold">Courses</h2>
              </div>
              <IconButton onClick={addCourse} title="Add course">
                <Plus className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="grid gap-2">
              {courses.map((course) => (
                <button
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`rounded-md border px-3 py-3 text-left transition ${
                    selectedCourse.id === course.id
                      ? "border-teal-400 bg-teal-50 text-teal-950"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span className="block text-sm font-bold">{course.name}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {course.credits} credits · target {course.targetPercentage}%
                  </span>
                </button>
              ))}
            </div>
          </section>
        </aside>

        <div className="grid min-w-0 gap-6">
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div>
                <p className="text-sm font-semibold text-teal-700">{data.program.majorName}</p>
                <h2 className="mt-1 text-2xl font-bold">{selectedCourse.name}</h2>
              </div>
              <IconButton
                onClick={() => deleteCourse(selectedCourse.id)}
                disabled={courses.length <= 1}
                title="Delete course"
                className="text-rose-600 hover:border-rose-300 hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Field label="Course name">
                <TextInput
                  value={selectedCourse.name}
                  onChange={(event) => updateSelectedCourse("name", event.target.value)}
                />
              </Field>
              <Field label="Course credits">
                <NumberInput
                  value={selectedCourse.credits}
                  onChange={(event) =>
                    updateSelectedCourse("credits", clampNumber(event.target.value, 0, 1000))
                  }
                />
              </Field>
              <Field label="Target percentage">
                <NumberInput
                  max={100}
                  value={selectedCourse.targetPercentage}
                  onChange={(event) =>
                    updateSelectedCourse("targetPercentage", clampNumber(event.target.value, 0, 100))
                  }
                />
              </Field>
              <Field label="Target course GPA">
                <NumberInput
                  max={4}
                  value={selectedCourse.targetGpa}
                  onChange={(event) =>
                    updateSelectedCourse("targetGpa", clampNumber(event.target.value, 0, 4))
                  }
                />
              </Field>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-teal-700" />
                <h2 className="text-lg font-bold">Course Analytics</h2>
              </div>
              {!weightIsValid && (
                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                  <AlertTriangle className="h-4 w-4" />
                  Weights total {round(courseStats.totalWeight)}%, not 100%.
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Secured score" value={`${round(courseStats.securedScore)}%`} tone="blue" />
              <Stat label="Remaining weight" value={`${round(courseStats.remainingWeight)}%`} />
              <Stat
                label="Required remaining avg"
                value={
                  courseStats.remainingWeight === 0
                    ? "Done"
                    : `${round(Math.max(0, courseStats.requiredAverage))}%`
                }
                tone={completionTone}
              />
              <Stat
                label="Predicted final"
                value={`${round(courseStats.predictedPercentage)}% / ${round(courseStats.predictedGpa)} GPA`}
                tone="green"
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">Target status</p>
                <p className="mt-2 flex items-center gap-2 text-lg font-bold">
                  {courseStats.targetAchievable ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                  )}
                  {courseStats.targetAlreadyMet
                    ? "Already secured"
                    : courseStats.targetAchievable
                      ? "Still achievable"
                      : "Not achievable"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">One component left</p>
                <p className="mt-2 text-lg font-bold">
                  {courseStats.oneRemainingRequired === null
                    ? "Not applicable"
                    : `${round(Math.max(0, courseStats.oneRemainingRequired))}% needed`}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-600">Overall GPA impact</p>
                <p className="mt-2 text-lg font-bold">
                  {round(data.program.currentGpa)} to {round(projectedOverall)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {targetOverallDelta <= 0
                    ? "Meets the target overall GPA."
                    : `${targetOverallDelta} GPA points below target.`}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-teal-700" />
                <h2 className="text-lg font-bold">Grading Components</h2>
              </div>
              <PrimaryButton onClick={addComponent}>
                <Plus className="h-4 w-4" />
                Add component
              </PrimaryButton>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-separate border-spacing-y-2 text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-1">Done</th>
                    <th className="px-2 py-1">Component</th>
                    <th className="px-2 py-1">Weight %</th>
                    <th className="px-2 py-1">Score</th>
                    <th className="px-2 py-1">Contribution</th>
                    <th className="px-2 py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCourse.components.map((component) => (
                    <tr key={component.id} className="rounded-md bg-slate-50">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={component.completed}
                          onChange={(event) =>
                            updateComponent(component.id, "completed", event.target.checked)
                          }
                          className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <TextInput
                          value={component.name}
                          onChange={(event) => updateComponent(component.id, "name", event.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <NumberInput
                          value={component.weight}
                          onChange={(event) =>
                            updateComponent(component.id, "weight", clampNumber(event.target.value, 0, 1000))
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <NumberInput
                          max={100}
                          value={component.score}
                          onChange={(event) =>
                            updateComponent(component.id, "score", clampNumber(event.target.value, 0, 100))
                          }
                        />
                      </td>
                      <td className="px-2 py-2 font-semibold text-slate-700">
                        {component.completed
                          ? `${round((component.score * component.weight) / 100)}%`
                          : "Pending"}
                      </td>
                      <td className="px-2 py-2">
                        <IconButton
                          onClick={() => removeComponent(component.id)}
                          title="Remove component"
                          className="text-rose-600 hover:border-rose-300 hover:text-rose-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <div className="mb-4 flex items-center gap-2">
                <Target className="h-5 w-5 text-teal-700" />
                <h2 className="text-lg font-bold">Scenario Simulation</h2>
              </div>
              {courseStats.remaining.length === 0 ? (
                <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">
                  All components are complete. The predicted final score is based on secured work.
                </p>
              ) : (
                <div className="grid gap-3">
                  {courseStats.remaining.map((component) => (
                    <Field key={component.id} label={`${component.name} possible score`}>
                      <NumberInput
                        max={100}
                        value={selectedCourse.scenarioScores?.[component.id] ?? component.score ?? 0}
                        onChange={(event) =>
                          updateScenarioScore(component.id, clampNumber(event.target.value, 0, 100))
                        }
                      />
                    </Field>
                  ))}
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <Stat label="Scenario final" value={`${round(courseStats.predictedPercentage)}%`} tone="green" />
                    <Stat label="Scenario GPA" value={round(courseStats.predictedGpa)} tone="blue" />
                  </div>
                </div>
              )}
            </section>

            <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-soft">
              <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-teal-700" />
                  <h2 className="text-lg font-bold">GPA Conversion Table</h2>
                </div>
                <IconButton onClick={addConversionRow} title="Add conversion row">
                  <Plus className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid gap-2">
                {[...data.conversionTable]
                  .sort((a, b) => b.minPercentage - a.minPercentage)
                  .map((row) => (
                    <div key={row.id} className="grid min-w-0 grid-cols-[1fr_80px_80px_40px] gap-2 sm:grid-cols-[1fr_1fr_1fr_40px]">
                      <TextInput
                        aria-label="Grade label"
                        value={row.label}
                        onChange={(event) => updateConversionRow(row.id, "label", event.target.value)}
                      />
                      <NumberInput
                        aria-label="Minimum percentage"
                        max={100}
                        value={row.minPercentage}
                        onChange={(event) =>
                          updateConversionRow(row.id, "minPercentage", clampNumber(event.target.value, 0, 100))
                        }
                      />
                      <NumberInput
                        aria-label="GPA value"
                        max={4}
                        value={row.gpa}
                        onChange={(event) =>
                          updateConversionRow(row.id, "gpa", clampNumber(event.target.value, 0, 4))
                        }
                      />
                      <IconButton
                        onClick={() => deleteConversionRow(row.id)}
                        title="Delete conversion row"
                        disabled={data.conversionTable.length <= 1}
                        className="text-rose-600 hover:border-rose-300 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <Save className="h-4 w-4 text-teal-700" />
                Changes are saved in this browser automatically.
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
