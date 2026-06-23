// ─── CONFIG ──────────────────────────────────────────────────
const MAX_INGREDIENTS = 10;
let ingredientCount = 1;

// methods, ingredientsList, statusesList injected by EJS into the page

// ─── ADD INGREDIENT ──────────────────────────────────────────
function addIngredient() {
    if (ingredientCount >= MAX_INGREDIENTS) {
        alert(`Maximum ${MAX_INGREDIENTS} ingredients allowed.`);
        return;
    }

    const idx = ingredientCount;
    const container = document.getElementById("ingredients-container");

    const block = document.createElement("div");
    block.classList.add("ingredient-block");
    block.id = `ingredient-block-${idx}`;

    block.innerHTML = `
        <hr>
        <h2>Ingredient ${idx + 1}</h2>

        <button
            type="button"
            onclick="removeIngredient(${idx})"
        >
            Remove Ingredient
        </button>

        <br><br>

        <div>
            <label>Ingredient:</label>
            <select name="ingredients[${idx}][ingredients_id]" required>
                <option value="">-- Select --</option>
                ${window.ingredientsList.map(i => `
                    <option value="${i.ingredients_id}">
                        ${i.ingredients_name}
                    </option>
                `).join("")}
            </select>
        </div>

        <br>

        <div>
            <label>Final Status:</label>
            <select name="ingredients[${idx}][ingredientstatus_id]" required>
                <option value="">-- Select --</option>
                ${window.statusesList.map(s => `
                    <option value="${s.ingredientstatus_id}">
                        ${s.ingredientstatus_name}
                    </option>
                `).join("")}
            </select>
        </div>

        <br>

        <div>
            <label>Required Amount:</label>
            <input
                type="number"
                name="ingredients[${idx}][required_amount]"
                min="1"
                value="1"
                required
            >
        </div>

        <br>

        <div id="steps-${idx}">
            <h3>Preparation Steps</h3>
        </div>

        <button
            type="button"
            onclick="addStep(${idx})"
        >
            + Add Step
        </button>
    `;

    container.appendChild(block);
    ingredientCount++;
}

// ─── REMOVE INGREDIENT ───────────────────────────────────────
function removeIngredient(idx) {
    const block = document.getElementById(`ingredient-block-${idx}`);
    block.remove();
}

// ─── ADD STEP ────────────────────────────────────────────────
function addStep(ingredientIndex) {

    const container =
        document.getElementById(`steps-${ingredientIndex}`);

    const stepNumber =
        container.querySelectorAll(".step-row").length + 1;

    const div = document.createElement("div");
    div.classList.add("step-row");

    div.innerHTML = `
        <label>
            Preparation Step ${stepNumber}:
        </label>

        <select
            name="ingredients[${ingredientIndex}][preparation_steps][]"
        >
            <option value="">
                -- None --
            </option>

            ${methods.map(method => `
                <option value="${method.preparation_method_id}">
                    ${method.preparation_method_name}
                </option>
            `).join("")}

        </select>

        <button
            type="button"
            onclick="removeStep(this, ${ingredientIndex})"
        >
            Remove
        </button>

        <br><br>
    `;

    container.appendChild(div);
    renumberSteps(ingredientIndex);
}

// ─── REMOVE STEP ─────────────────────────────────────────────
function removeStep(button, ingredientIndex) {

    const stepRow = button.parentElement;
    stepRow.remove();
    renumberSteps(ingredientIndex);
}

// ─── RENUMBER STEPS ──────────────────────────────────────────
function renumberSteps(ingredientIndex) {

    const container =
        document.getElementById(`steps-${ingredientIndex}`);

    const rows =
        container.querySelectorAll(".step-row");

    rows.forEach((row, index) => {

        const label = row.querySelector("label");
        label.textContent = `Preparation Step ${index + 1}:`;
    });
}