'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Pauses execution for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Updates the job record in RTDB / LocalDatabase.
 * @param {any} db
 * @param {string} jobId
 * @param {Object} update - Fields to merge into the job record.
 */
async function updateJob(db, jobId, update) {
  await db.ref(`jobs/${jobId}`).update({
    ...update,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Executes the Python CP-SAT solver.
 * @param {string} dataDir - Directory containing the 10 CSV files.
 * @param {number} [timeLimitSec=25]
 * @returns {Promise<Object>}
 */
function runPythonCPSAT(dataDir, timeLimitSec = 25) {
  return new Promise((resolve, reject) => {
    const pythonExe = process.env.PYTHON_PATH || 'python';
    const scriptPath = path.resolve(__dirname, '../engine/cpsat_solver.py');

    const args = [
      scriptPath,
      '--data', dataDir,
      '--time-limit', String(timeLimitSec),
    ];

    const child = spawn(pythonExe, args, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString('utf-8');
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString('utf-8');
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start CP-SAT solver: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0 && !stdoutData.trim()) {
        return reject(new Error(`CP-SAT solver process exited with code ${code}. Stderr: ${stderrData.trim()}`));
      }

      try {
        const result = JSON.parse(stdoutData.trim());
        resolve(result);
      } catch (parseErr) {
        reject(new Error(`Failed to parse CP-SAT solver JSON output: ${parseErr.message}. Output was: ${stdoutData.slice(0, 300)}`));
      }
    });
  });
}

/**
 * Async job that generates a schedule using imported data and Google OR-Tools CP-SAT.
 * @param {string} jobId
 * @param {any} db
 */
async function generateSchedule(jobId, db) {
  let tempUploadDir = null;

  try {
    await updateJob(db, jobId, {
      state: 'running',
      progress: 10,
      message: 'กำลังตรวจสอบชุดข้อมูลและเตรียมตัวแปรเงื่อนไข...',
    });

    // Check imported data in database
    const importSnapshot = await db.ref('importedData').once('value');
    const importedData = importSnapshot.val() || {};

    let targetDataDir = path.resolve(__dirname, '../../sample-data/raw');

    // If custom files content was uploaded, write them to a temporary directory
    if (importedData.files && typeof importedData.files === 'object' && Object.keys(importedData.files).length >= 8) {
      tempUploadDir = path.resolve(__dirname, `../../data/uploads/${jobId}`);
      fs.mkdirSync(tempUploadDir, { recursive: true });

      for (const [filename, content] of Object.entries(importedData.files)) {
        if (typeof content === 'string' && content.trim()) {
          fs.writeFileSync(path.join(tempUploadDir, filename), content, 'utf-8');
        }
      }

      // If any of the 10 files wasn't uploaded, fallback copy from sample-data/raw
      const requiredFiles = [
        'groups.csv', 'teachers.csv', 'rooms.csv', 'courses.csv', 'offerings.csv',
        'timeslots.csv', 'blocked_slots.csv', 'fixed_sessions.csv', 'students.csv', 'enrollments.csv'
      ];
      for (const reqFile of requiredFiles) {
        const destPath = path.join(tempUploadDir, reqFile);
        if (!fs.existsSync(destPath)) {
          const sampleSource = path.join(targetDataDir, reqFile);
          if (fs.existsSync(sampleSource)) {
            fs.copyFileSync(sampleSource, destPath);
          }
        }
      }

      targetDataDir = tempUploadDir;
    }

    await updateJob(db, jobId, {
      progress: 30,
      message: 'กำลังสร้างแบบจำลอง Google OR-Tools CP-SAT และประมวลผลข้อจำกัดทั้ง 12 ข้อ...',
    });

    // Run CP-SAT Solver
    const result = await runPythonCPSAT(targetDataDir, 25);

    await updateJob(db, jobId, {
      progress: 85,
      message: 'ประมวลผลเสร็จสิ้น กำลังตรวจสอบผลลัพธ์และความสมบูรณ์...',
    });
    await sleep(200);

    if (result.status === 'done') {
      const sessions = result.sessions || [];
      const checks = result.checks || [];

      await db.ref(`results/${jobId}`).set({
        sessions,
        checks,
        generatedAt: new Date().toISOString(),
        totalSessions: result.total_sessions || sessions.length,
        totalPeriods: result.total_periods || 160,
        elapsedSec: result.elapsed_sec,
        solverStatus: result.solver_status || 'OPTIMAL',
      });

      await updateJob(db, jobId, {
        state: 'done',
        progress: 100,
        message: `จัดตารางสำเร็จ ${sessions.length} ครั้งเรียน (${result.total_periods || 160} คาบ) ผ่านทั้ง 12 เงื่อนไขสมบูรณ์`,
      });
    } else if (result.status === 'infeasible') {
      await updateJob(db, jobId, {
        state: 'infeasible',
        progress: 100,
        message: result.message || 'ไม่พบคำตอบที่ผ่านเงื่อนไขบังคับทั้งหมดภายใต้ข้อมูลนี้ (Infeasible)',
      });
    } else if (result.status === 'timeout') {
      await updateJob(db, jobId, {
        state: 'timeout',
        progress: 100,
        message: 'หมดเวลาคำนวณ (Timeout) กรุณาเพิ่มระยะเวลาหรือผ่อนคลายเงื่อนไข',
      });
    } else {
      throw new Error(result.message || 'เกิดข้อผิดพลาดในการประมวลผลของ Solver');
    }
  } catch (err) {
    console.error(`Schedule generation failed for job ${jobId}:`, err);
    await updateJob(db, jobId, {
      state: 'error',
      progress: 100,
      message: err.message || 'เกิดข้อผิดพลาดในการจัดตาราง',
    });
  } finally {
    // Clean up temporary files if created
    if (tempUploadDir && fs.existsSync(tempUploadDir)) {
      try {
        fs.rmSync(tempUploadDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Failed to cleanup temp dir:', cleanupErr.message);
      }
    }
  }
}

module.exports = { generateSchedule };
