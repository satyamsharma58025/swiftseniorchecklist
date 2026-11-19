export const SOW_ACTIVATION_BATCH_2 = [
  {
    employeeName: "Rupesh Kumar Choudhary",
    employeeId: "cmua28zqa000uicsa7cbkoeae",
    taskCodes: [
      "SOW-RUPESH-01",
      "SOW-RUPESH-02",
      "SOW-RUPESH-04",
      "SOW-RUPESH-05",
      "SOW-RUPESH-06",
      "SOW-RUPESH-07",
      "SOW-RUPESH-08",
      "SOW-RUPESH-09",
      "SOW-RUPESH-10",
      "SOW-RUPESH-11",
      "SOW-RUPESH-12",
      "SOW-RUPESH-16",
    ],
  },
  {
    employeeName: "Yogesh Tomar",
    employeeId: "cmu9x7yed0000e8a6s46ra7ly",
    taskCodes: [
      "SOW-YOGESH-TOMAR-01",
      "SOW-YOGESH-TOMAR-02",
      "SOW-YOGESH-TOMAR-03",
      "SOW-YOGESH-TOMAR-04",
      "SOW-YOGESH-TOMAR-05",
      "SOW-YOGESH-TOMAR-06",
      "SOW-YOGESH-TOMAR-07",
      "SOW-YOGESH-TOMAR-08",
      "SOW-YOGESH-TOMAR-12",
      "SOW-YOGESH-TOMAR-15",
    ],
  },
  {
    employeeName: "Santosh Guddu",
    employeeId: "cmu9x7zg40001e8a6lwah00pv",
    taskCodes: [
      "SOW-SANTOSH-KUMAR-GUDDU-01",
      "SOW-SANTOSH-KUMAR-GUDDU-02",
      "SOW-SANTOSH-KUMAR-GUDDU-03",
      "SOW-SANTOSH-KUMAR-GUDDU-06",
      "SOW-SANTOSH-KUMAR-GUDDU-07",
      "SOW-SANTOSH-KUMAR-GUDDU-08",
      "SOW-SANTOSH-KUMAR-GUDDU-09",
      "SOW-SANTOSH-KUMAR-GUDDU-10",
      "SOW-SANTOSH-KUMAR-GUDDU-11",
      "SOW-SANTOSH-KUMAR-GUDDU-12",
    ],
  },
  {
    employeeName: "Pratyush Nanda",
    employeeId: "cmu9x85o30007e8a6d680inyx",
    taskCodes: [
      "SOW-PRATYUSH-NANDA-01",
      "SOW-PRATYUSH-NANDA-02",
      "SOW-PRATYUSH-NANDA-03",
      "SOW-PRATYUSH-NANDA-04",
      "SOW-PRATYUSH-NANDA-05",
      "SOW-PRATYUSH-NANDA-06",
      "SOW-PRATYUSH-NANDA-13",
      "SOW-PRATYUSH-NANDA-14",
    ],
  },
  {
    employeeName: "Chandan Kumar",
    employeeId: "cmu9x87qk0009e8a6u65gpc7s",
    taskCodes: [
      "SOW-CHANDAN-KUMAR-01",
      "SOW-CHANDAN-KUMAR-02",
      "SOW-CHANDAN-KUMAR-04",
      "SOW-CHANDAN-KUMAR-08",
      "SOW-CHANDAN-KUMAR-12",
    ],
  },
  {
    employeeName: "Mohar Pal",
    employeeId: "cmua28mzu000jicsaw1tstd3n",
    taskCodes: ["SOW-MOHAR-PAL-05", "SOW-MOHAR-PAL-06", "SOW-MOHAR-PAL-10"],
  },
  {
    employeeName: "Geda Tudu",
    employeeId: "cmua293qo000yicsacfii2nj2",
    taskCodes: ["SOW-GEDA-TUDU-03", "SOW-GEDA-TUDU-05", "SOW-GEDA-TUDU-06"],
  },
  {
    employeeName: "Balay Ray",
    employeeId: "cmua28q3m000micsakrxviy3z",
    taskCodes: ["SOW-BALAI-RAY-02", "SOW-BALAI-RAY-03", "SOW-BALAI-RAY-09"],
  },
  {
    employeeName: "Deb Kumar Nag",
    employeeId: "cmu9x84mp0006e8a6jir57wmd",
    taskCodes: ["SOW-DEB-KUMAR-NAG-07", "SOW-DEB-KUMAR-NAG-11"],
  },
] as const;

export const SOW_ACTIVATION_BATCH_2_TASK_CODES =
  SOW_ACTIVATION_BATCH_2.flatMap((employee) => employee.taskCodes);

export const SOW_RETIREMENT_BATCH_2 = [
  {
    employeeName: "Pratyush Nanda",
    employeeId: "cmu9x85o30007e8a6d680inyx",
    taskCodes: ["T-D-004"],
  },
  {
    employeeName: "Chandan Kumar",
    employeeId: "cmu9x87qk0009e8a6u65gpc7s",
    taskCodes: ["T-W-001", "T-W-002"],
  },
  {
    employeeName: "Deb Kumar Nag",
    employeeId: "cmu9x84mp0006e8a6jir57wmd",
    taskCodes: ["DEB-001", "DEB-002", "DEB-003", "DEB-004", "DEB-005", "DEB-006", "DEB-007"],
  },
  {
    employeeName: "Santosh Guddu",
    employeeId: "cmu9x7zg40001e8a6lwah00pv",
    taskCodes: ["T-D-001", "T-D-002"],
  },
  {
    employeeName: "Yogesh Tomar",
    employeeId: "cmu9x7yed0000e8a6s46ra7ly",
    taskCodes: [
      "T-D-005",
      "T-D-006",
      "T-D-007",
      "T-D-008",
      "T-D-009",
      "T-D-010",
      "T-D-011",
      "T-D-012",
      "T-D-013",
      "T-D-014",
      "T-D-015",
      "T-D-016",
      "YOG-001",
      "YOG-002",
      "YOG-003",
      "YOG-004",
      "YOG-005",
      "YOG-006",
      "YOG-007",
      "YOG-008",
      "YOG-009",
      "YOG-010",
      "YOG-011",
      "YOG-012",
    ],
  },
] as const;

export const SOW_RETIREMENT_BATCH_2_TASK_CODES =
  SOW_RETIREMENT_BATCH_2.flatMap((employee) => employee.taskCodes);
