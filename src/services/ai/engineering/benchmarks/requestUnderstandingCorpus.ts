/**
 * Request Understanding Evaluation Corpus (200+ reviewed examples)
 * Split: ~70% dev, ~15% validation, ~15% holdout
 */

export interface RequestUnderstandingTestCase {
  id: string;
  input: string;
  category: 'arithmetic' | 'transfer_function' | 'pid' | 'observability' | 'units' | 'typos' | 'unsupported';
  split: 'dev' | 'val' | 'holdout';
  expectedOperations: string[];
  expectedEntityTypes: string[];
  expectedValues?: Array<{ normalizedValue: unknown; unit?: string }>;
  expectedStatus: 'ready' | 'clarification_required' | 'unsupported';
}

export const REQUEST_UNDERSTANDING_CORPUS: RequestUnderstandingTestCase[] = [
  {
    "id": "arithmetic_1",
    "input": "Add 10 and 20",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 10
      },
      {
        "normalizedValue": 20
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_2",
    "input": "Add 5 and 15",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 5
      },
      {
        "normalizedValue": 15
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_3",
    "input": "Add 100 and 250",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 100
      },
      {
        "normalizedValue": 250
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_4",
    "input": "Add -10 and 30",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": -10
      },
      {
        "normalizedValue": 30
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_5",
    "input": "Add 3.5 and 7.2",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 3.5
      },
      {
        "normalizedValue": 7.2
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_6",
    "input": "Add 0.01 and 0.09",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 0.01
      },
      {
        "normalizedValue": 0.09
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_7",
    "input": "Sum of 40 and 60",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 40
      },
      {
        "normalizedValue": 60
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_8",
    "input": "Calculate sum of 12 and 18",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 12
      },
      {
        "normalizedValue": 18
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_9",
    "input": "Plus 15 and 25",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 15
      },
      {
        "normalizedValue": 25
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_10",
    "input": "Add 50 and 50",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 50
      },
      {
        "normalizedValue": 50
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_11",
    "input": "Add 1 and 2 and 3",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 1
      },
      {
        "normalizedValue": 2
      },
      {
        "normalizedValue": 3
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_12",
    "input": "Compute 25 + 75",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 25
      },
      {
        "normalizedValue": 75
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_13",
    "input": "Sum up 8 and 9",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 8
      },
      {
        "normalizedValue": 9
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_14",
    "input": "Add 0 and 100",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 0
      },
      {
        "normalizedValue": 100
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_15",
    "input": "Add 1000 and 2000",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 1000
      },
      {
        "normalizedValue": 2000
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_16",
    "input": "Subtract 10 from 30",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 10
      },
      {
        "normalizedValue": 30
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_17",
    "input": "Subtract 5 from 20",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 5
      },
      {
        "normalizedValue": 20
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_18",
    "input": "Subtract 50 from 100",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 50
      },
      {
        "normalizedValue": 100
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_19",
    "input": "Calculate 100 minus 40",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 100
      },
      {
        "normalizedValue": 40
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_20",
    "input": "Subtract 2.5 from 10",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 2.5
      },
      {
        "normalizedValue": 10
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_21",
    "input": "Subtract -5 from 15",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": -5
      },
      {
        "normalizedValue": 15
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_22",
    "input": "Compute 80 - 20",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 80
      },
      {
        "normalizedValue": 20
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_23",
    "input": "Difference between 90 and 30",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 90
      },
      {
        "normalizedValue": 30
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_24",
    "input": "Minus 15 from 45",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 15
      },
      {
        "normalizedValue": 45
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_25",
    "input": "Subtract 0.5 from 1.0",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedValues": [
      {
        "normalizedValue": 0.5
      },
      {
        "normalizedValue": 1
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_26",
    "input": "Multiply 10 by 20",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 10
      },
      {
        "normalizedValue": 20
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_27",
    "input": "Multiply 5 by 6",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 5
      },
      {
        "normalizedValue": 6
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_28",
    "input": "Multiply 100 by 4",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 100
      },
      {
        "normalizedValue": 4
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_29",
    "input": "Multiply -2 by 50",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": -2
      },
      {
        "normalizedValue": 50
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_30",
    "input": "Product of 12 and 12",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 12
      },
      {
        "normalizedValue": 12
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_31",
    "input": "Compute 7 * 8",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 7
      },
      {
        "normalizedValue": 8
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_32",
    "input": "Multiply 0.5 by 20",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 0.5
      },
      {
        "normalizedValue": 20
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_33",
    "input": "Multiply 2.5 by 4.0",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 2.5
      },
      {
        "normalizedValue": 4
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_34",
    "input": "Multiply 10 by 100",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 10
      },
      {
        "normalizedValue": 100
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_35",
    "input": "Calculate product of 15 and 3",
    "category": "arithmetic",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 15
      },
      {
        "normalizedValue": 3
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_36",
    "input": "Multiply 25 by 4",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 25
      },
      {
        "normalizedValue": 4
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_37",
    "input": "Times 3 and 9",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 3
      },
      {
        "normalizedValue": 9
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_38",
    "input": "Multiply 1.2 by 10",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedValues": [
      {
        "normalizedValue": 1.2
      },
      {
        "normalizedValue": 10
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_39",
    "input": "Divide 100 by 4",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 100
      },
      {
        "normalizedValue": 4
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_40",
    "input": "Divide 50 by 2",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 50
      },
      {
        "normalizedValue": 2
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_41",
    "input": "Divide 120 by 6",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 120
      },
      {
        "normalizedValue": 6
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_42",
    "input": "Divide 10 by 2.5",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 10
      },
      {
        "normalizedValue": 2.5
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_43",
    "input": "Quotient of 80 and 4",
    "category": "arithmetic",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 80
      },
      {
        "normalizedValue": 4
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_44",
    "input": "Calculate 90 / 3",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedValues": [
      {
        "normalizedValue": 90
      },
      {
        "normalizedValue": 3
      }
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "arithmetic_45",
    "input": "Create a model adding two numbers",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Sum"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "arithmetic_46",
    "input": "Create a model subtracting two numbers",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Sum"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "arithmetic_47",
    "input": "Multiply numbers together",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "VectorMul"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "arithmetic_48",
    "input": "Divide two numbers in model",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "VectorDiv"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "arithmetic_49",
    "input": "Add two constants",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Sum"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "arithmetic_50",
    "input": "Perform addition operation",
    "category": "arithmetic",
    "split": "holdout",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Sum"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "transfer_function_1",
    "input": "Create a transfer function with numerator: [1], denominator: [1, 2, 1]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_2",
    "input": "Create transfer function numerator: [2], denominator: [1, 5]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_3",
    "input": "Build transfer function with numerator: [10], denominator: [1, 4, 10]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_4",
    "input": "Create a transfer function numerator: [5], denominator: [1, 10, 25]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_5",
    "input": "Model transfer function numerator: [1], denominator: [1, 1]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_6",
    "input": "Create a transfer function with numerator: [3], denominator: [1, 6, 9]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_7",
    "input": "Add transfer function numerator: [4], denominator: [1, 2]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_8",
    "input": "Create a transfer function with numerator: [1], denominator: [1, 0.5]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_9",
    "input": "Plant model transfer function numerator: [100], denominator: [1, 20, 100]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_10",
    "input": "Transfer function numerator: [1], denominator: [1, 3, 2]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_11",
    "input": "Build a transfer function with numerator: [2.5], denominator: [1, 5.0]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_12",
    "input": "Create transfer function with numerator: [1], denominator: [0.01, 1]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_13",
    "input": "Transfer function model numerator: [12], denominator: [1, 8, 16]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_14",
    "input": "Create a transfer function with numerator: [50], denominator: [1, 15, 50]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_15",
    "input": "Add plant transfer function numerator: [1], denominator: [1, 0.1, 1]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_16",
    "input": "Create a transfer function numerator: [8], denominator: [1, 4]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_17",
    "input": "Transfer function plant with numerator: [20], denominator: [1, 7, 12]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_18",
    "input": "Create transfer function numerator: [1], denominator: [1, 2, 3, 4]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_19",
    "input": "Build transfer function numerator: [6], denominator: [1, 5, 6]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_20",
    "input": "Create a transfer function with numerator: [15], denominator: [1, 10]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_21",
    "input": "Add transfer function model numerator: [1], denominator: [1, 14, 49]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_22",
    "input": "Create a transfer function with numerator: [0.5], denominator: [1, 2]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_23",
    "input": "Transfer function numerator: [30], denominator: [1, 11, 30]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_24",
    "input": "Create plant transfer function numerator: [1], denominator: [1, 0.8, 1]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_25",
    "input": "Build transfer function with numerator: [40], denominator: [1, 13, 40]",
    "category": "transfer_function",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_26",
    "input": "Create transfer function numerator: [2], denominator: [1, 3]",
    "category": "transfer_function",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_27",
    "input": "Add transfer function with numerator: [1], denominator: [1, 12, 36]",
    "category": "transfer_function",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_28",
    "input": "Transfer function model numerator: [7], denominator: [1, 7]",
    "category": "transfer_function",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_29",
    "input": "Create a transfer function with numerator: [25], denominator: [1, 10, 25]",
    "category": "transfer_function",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_30",
    "input": "Build a transfer function numerator: [1], denominator: [1, 4, 8]",
    "category": "transfer_function",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_31",
    "input": "Create transfer function with numerator: [18], denominator: [1, 9]",
    "category": "transfer_function",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_32",
    "input": "Add plant transfer function with numerator: [1], denominator: [1, 16, 64]",
    "category": "transfer_function",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_33",
    "input": "Transfer function numerator: [9], denominator: [1, 6, 9]",
    "category": "transfer_function",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_34",
    "input": "Create a transfer function with numerator: [35], denominator: [1, 12, 35]",
    "category": "transfer_function",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "transfer_function_35",
    "input": "Build transfer function numerator: [1], denominator: [1, 18, 81]",
    "category": "transfer_function",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_1",
    "input": "Create a transfer function and a PID controller for it",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_2",
    "input": "Design a PID control loop for a transfer function plant",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_3",
    "input": "Add a PID controller to regulate transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_4",
    "input": "Create closed loop control with PID and transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_5",
    "input": "Design PID feedback loop for transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_6",
    "input": "Add PID controller and transfer function model",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_7",
    "input": "Create feedback system with PID and transfer function plant",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_8",
    "input": "Build PID controller loop with plant transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_9",
    "input": "Add transfer function with PID controller in feedback",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_10",
    "input": "Create PID control of transfer function system",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_11",
    "input": "Design transfer function plant with PID regulation",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_12",
    "input": "Build closed-loop PID control with transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_13",
    "input": "Add PID loop for transfer function plant",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_14",
    "input": "Create a transfer function and connect PID controller",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_15",
    "input": "Design PID closed loop for transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_16",
    "input": "Add PID controller for plant transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_17",
    "input": "Create feedback loop with transfer function and PID",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_18",
    "input": "Build transfer function closed loop with PID controller",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_19",
    "input": "Connect PID controller to transfer function plant",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_20",
    "input": "Create PID regulated transfer function model",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_21",
    "input": "Design feedback controller PID for transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_22",
    "input": "Add transfer function plant and PID controller",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_23",
    "input": "Create closed-loop system using PID and transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_24",
    "input": "Build PID control loop for transfer function",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_25",
    "input": "Add PID controller to transfer function plant model",
    "category": "pid",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_26",
    "input": "Create transfer function with closed-loop PID controller",
    "category": "pid",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_27",
    "input": "Design PID loop for plant transfer function",
    "category": "pid",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_28",
    "input": "Connect PID to transfer function model in feedback",
    "category": "pid",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_29",
    "input": "Create closed loop transfer function with PID controller",
    "category": "pid",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_30",
    "input": "Build PID feedback loop for plant transfer function",
    "category": "pid",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_31",
    "input": "Add PID regulation to transfer function plant",
    "category": "pid",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_32",
    "input": "Create feedback control loop with PID and transfer function",
    "category": "pid",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_33",
    "input": "Design PID controller for transfer function plant model",
    "category": "pid",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_34",
    "input": "Build transfer function system with PID controller loop",
    "category": "pid",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "pid_feedback_35",
    "input": "Add PID controller and connect to transfer function",
    "category": "pid",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "PID_CONTROLLER",
      "TRANSFER_FUNCTION"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_1",
    "input": "Add 10 and 20 and display on a scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_2",
    "input": "Add 5 and 15 and display it on a scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_3",
    "input": "Multiply 10 by 100 and display it on a scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_4",
    "input": "Multiply 4 by 25 and show result on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_5",
    "input": "Subtract 20 from 50 and plot on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_6",
    "input": "Divide 100 by 5 and display on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_7",
    "input": "Create a transfer function and observe output on a scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_8",
    "input": "Add 30 and 70 and observe on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_9",
    "input": "Multiply 8 by 9 and view on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_10",
    "input": "Subtract 10 from 40 and display on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_11",
    "input": "Divide 200 by 4 and show on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_12",
    "input": "Add 15 and 35 and monitor on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_13",
    "input": "Multiply 6 by 7 and plot on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_14",
    "input": "Subtract 5 from 25 and observe on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_15",
    "input": "Divide 80 by 2 and display result on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_16",
    "input": "Add 50 and 150 and show on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_17",
    "input": "Multiply 12 by 5 and display on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_18",
    "input": "Subtract 100 from 300 and plot on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_19",
    "input": "Divide 60 by 3 and view on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_20",
    "input": "Add 2.5 and 7.5 and display on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_21",
    "input": "Multiply 3 by 15 and show on scope",
    "category": "observability",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_22",
    "input": "Subtract 12 from 50 and observe on scope",
    "category": "observability",
    "split": "val",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_23",
    "input": "Divide 150 by 3 and plot on scope",
    "category": "observability",
    "split": "val",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_24",
    "input": "Add 45 and 55 and monitor on scope",
    "category": "observability",
    "split": "val",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_25",
    "input": "Multiply 20 by 5 and display on scope",
    "category": "observability",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_26",
    "input": "Subtract 30 from 90 and show on scope",
    "category": "observability",
    "split": "val",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_27",
    "input": "Divide 400 by 8 and view on scope",
    "category": "observability",
    "split": "holdout",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_28",
    "input": "Add 60 and 40 and plot on scope",
    "category": "observability",
    "split": "holdout",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_29",
    "input": "Multiply 11 by 4 and display on scope",
    "category": "observability",
    "split": "holdout",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "observability_30",
    "input": "Subtract 15 from 60 and observe on scope",
    "category": "observability",
    "split": "holdout",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "units_1",
    "input": "Set frequency to 10kHz",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 10000,
        "unit": "Hz"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_2",
    "input": "Set frequency to 50Hz",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 50,
        "unit": "Hz"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_3",
    "input": "Set frequency to 1MHz",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 1000000,
        "unit": "Hz"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_4",
    "input": "Set frequency to 100Hz",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 100,
        "unit": "Hz"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_5",
    "input": "Set resistance to 100ohm",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 100,
        "unit": "ohm"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_6",
    "input": "Set resistance to 10kohm",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 10000,
        "unit": "ohm"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_7",
    "input": "Set resistance to 1Mohm",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 1000000,
        "unit": "ohm"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_8",
    "input": "Set resistance to 50 ohms",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 50,
        "unit": "ohm"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_9",
    "input": "Set voltage to 24V",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 24,
        "unit": "V"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_10",
    "input": "Set voltage to 12V",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 12,
        "unit": "V"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_11",
    "input": "Set voltage to 5V",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 5,
        "unit": "V"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_12",
    "input": "Set voltage to 230V",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 230,
        "unit": "V"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_13",
    "input": "Set voltage to 500mV",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.5,
        "unit": "V"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_14",
    "input": "Set capacitance to 10uF",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.00001,
        "unit": "F"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_15",
    "input": "Set capacitance to 100nF",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 1e-7,
        "unit": "F"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_16",
    "input": "Set capacitance to 1uF",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.000001,
        "unit": "F"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_17",
    "input": "Set capacitance to 22pF",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 2.2e-11,
        "unit": "F"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_18",
    "input": "Set inductance to 1mH",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.001,
        "unit": "H"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_19",
    "input": "Set inductance to 10uH",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.00001,
        "unit": "H"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_20",
    "input": "Set inductance to 100mH",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.1,
        "unit": "H"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_21",
    "input": "Set time step to 1ms",
    "category": "units",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.001,
        "unit": "s"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_22",
    "input": "Set sample time to 10us",
    "category": "units",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 0.00001,
        "unit": "s"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_23",
    "input": "Set duration to 5s",
    "category": "units",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 5,
        "unit": "s"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_24",
    "input": "Set bandwidth to 100rad/s",
    "category": "units",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 100,
        "unit": "rad/s"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_25",
    "input": "Set cutoff to 50rad/s",
    "category": "units",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 50,
        "unit": "rad/s"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_26",
    "input": "Set damping to 5%",
    "category": "units",
    "split": "val",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 5,
        "unit": "%"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_27",
    "input": "Set duty cycle to 50%",
    "category": "units",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 50,
        "unit": "%"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_28",
    "input": "Set overshoot to 10%",
    "category": "units",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 10,
        "unit": "%"
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_29",
    "input": "Set current limit to 15A",
    "category": "units",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 15
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "units_30",
    "input": "Set power to 100W",
    "category": "units",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [],
    "expectedValues": [
      {
        "normalizedValue": 100
      }
    ],
    "expectedStatus": "unsupported"
  },
  {
    "id": "typos_1",
    "input": "make a model add two cnstant each is 1 and display the result on a scope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_2",
    "input": "make a model multiply constant its value is 10 by 100 and display the result on a scope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_3",
    "input": "Multply 10 by 20",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_4",
    "input": "Substract 5 from 25",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_5",
    "input": "Add two contant numbers",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Sum"
    ],
    "expectedStatus": "clarification_required"
  },
  {
    "id": "typos_6",
    "input": "Disply result on scop",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_7",
    "input": "craete a model adding 10 and 20",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_8",
    "input": "mutliply 5 by 6 and disply on scope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_9",
    "input": "subtrct 10 from 30",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_10",
    "input": "divde 100 by 4",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_11",
    "input": "Add 10 and 20 and show on sccope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_12",
    "input": "make a model add two constant each is 5",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_13",
    "input": "multply 8 by 8 and dsplay on scope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_14",
    "input": "create transfer function and pid controler",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION",
      "PID_CONTROLLER"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_15",
    "input": "craete a model multiply 2 by 50",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_16",
    "input": "add ten and twenty",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_17",
    "input": "multiply five by ten and display on scope",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_18",
    "input": "subtract two from ten",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_19",
    "input": "divide one hundred by four",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_20",
    "input": "make a model add two cnstant each is 10",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_21",
    "input": "multply 15 by 3",
    "category": "typos",
    "split": "dev",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_22",
    "input": "substract 8 from 20 and show on scope",
    "category": "typos",
    "split": "val",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_23",
    "input": "crate a model adding 4 and 16",
    "category": "typos",
    "split": "val",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_24",
    "input": "multiblying 6 by 7",
    "category": "typos",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_25",
    "input": "add three and seven and plot on scop",
    "category": "typos",
    "split": "val",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_26",
    "input": "multiply four by twenty",
    "category": "typos",
    "split": "val",
    "expectedOperations": [
      "multiply"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorMul"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_27",
    "input": "subtract five from fifteen and disply on scope",
    "category": "typos",
    "split": "holdout",
    "expectedOperations": [
      "subtract"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_28",
    "input": "divide fifty by two",
    "category": "typos",
    "split": "holdout",
    "expectedOperations": [
      "divide"
    ],
    "expectedEntityTypes": [
      "Constant",
      "VectorDiv"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_29",
    "input": "add twenty and thirty and show on scope",
    "category": "typos",
    "split": "holdout",
    "expectedOperations": [
      "add"
    ],
    "expectedEntityTypes": [
      "Constant",
      "Sum",
      "Scope"
    ],
    "expectedStatus": "ready"
  },
  {
    "id": "typos_30",
    "input": "create a transfer function and a pid controller for it on scope",
    "category": "typos",
    "split": "holdout",
    "expectedOperations": [
      "create"
    ],
    "expectedEntityTypes": [
      "TRANSFER_FUNCTION",
      "PID_CONTROLLER",
      "Scope"
    ],
    "expectedStatus": "ready"
  }
];
