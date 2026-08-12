import { khetController } from './controller.js';
import { setCurrentEditingKhetId } from './editingState.js';

// Open / Close KhetEditor
export function changekhetEditorDrawer(goal) {
    if (goal == "open") {
        document.getElementById("khet-editor").style.bottom = "240px";
        document.getElementById("draw-up-btn").style.display = "none";
        document.getElementById("draw-close-btn").style.display = "block";
    } else if (goal == "close") {
        document.getElementById("khet-editor").style.bottom = "-20px";
        document.getElementById("draw-up-btn").style.display = "block";
        document.getElementById("draw-close-btn").style.display = "none";
    }
    return;
}

// Update Khet Table
export async function updateKhetTable() {

    // Select the table
    const table = document.querySelector('#khet-table');
            
    // Clear existing data rows (keep the header row)
    const rows = table.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
        rows[i].remove();
    }

    // Load Khets from the backend
    await khetController.loadAllKhets();

    // Populate the table with Khet data
    const khets = Object.values(khetController.khets);
    if (khets.length > 0) {
        document.getElementById("khet-table").style.display = "block";
        document.getElementById("clear-khets-btn").style.display = "block";
        for (const khet of khets) {
            const tr = document.createElement('tr');
            
            // KhetID column
            const tdId = document.createElement('td');
            tdId.textContent = khet.khetId;
            tr.appendChild(tdId);
            
            // KhetType column
            const tdType = document.createElement('td');
            tdType.textContent = khet.khetType;
            tr.appendChild(tdType);
            
            // Position column
            const tdPosition = document.createElement('td');
            tdPosition.textContent = `[${khet.position.join(', ')}]`;
            tr.appendChild(tdPosition);
            
            // Scale column
            const tdScale = document.createElement('td');
            tdScale.textContent = `[${khet.scale.join(', ')}]`;
            tr.appendChild(tdScale);
            
            // Code column
            const tdCode = document.createElement('td');
            tdCode.textContent = khet.code ? khet.code.join(', ') : '';
            tr.appendChild(tdCode);
            
            // Edit column
            const tdEdit = document.createElement('td');
            const editKhetButton = document.createElement('button');
            editKhetButton.textContent = "Edit";
            editKhetButton.addEventListener('click', async () => {
                setCurrentEditingKhetId(khet.khetId);

                // Switch to Edit Display
                changekhetEditorDrawer('open');
                document.getElementById("edit-group").style.display = 'block';
                document.getElementById("upload-group").style.display = 'none';

                // Display Type and ID
                document.getElementById("edit-khet-type").textContent = khet.khetType;
                document.getElementById("edit-khet-id").textContent = khet.khetId;

                // Display position and scale to  fields
                document.getElementById('pos-x').value = khet.position[0];
                document.getElementById('pos-y').value = khet.position[1];
                document.getElementById('pos-z').value = khet.position[2];
                document.getElementById('scale-x').value = khet.scale[0];
                document.getElementById('scale-y').value = khet.scale[1];
                document.getElementById('scale-z').value = khet.scale[2];
            });
            
            tdEdit.appendChild(editKhetButton);
            tr.appendChild(tdEdit);
            
            // Delete column
            const tdDelete = document.createElement('td');
            const deleteKhetButton = document.createElement('button');
            deleteKhetButton.textContent = "Delete";
            deleteKhetButton.addEventListener('click', async () => {

                // Delete Khet from Khetcontroller, keep asset in cache
                await khetController.removeEntry(khet.khetId);
                console.log('Khet deleted'); // Log confirmation
                await updateKhetTable();
            });
            tdDelete.appendChild(deleteKhetButton);
            tr.appendChild(tdDelete);
            
            // Append the row to the table
            table.appendChild(tr);
        }
    } else {
        document.getElementById("khet-table").style.display = "none";
        document.getElementById("clear-khets-btn").style.display = "none";
    }
    return;
}
