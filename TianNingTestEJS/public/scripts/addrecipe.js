    function addStep(ingredientIndex) {

        const container =
            document.getElementById(`steps-${ingredientIndex}`);

        const stepNumber =
            container.querySelectorAll(".step-row").length + 1;

        // Create wrapper div
        const div = document.createElement("div");

        div.classList.add("step-row");

        div.innerHTML = `
            <label>
                Preparation Step ${stepNumber}:
            </label>

            <select
                name="ingredients[${ingredientIndex}][preparation_steps]"
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

    function removeStep(button, ingredientIndex) {

        // Find the whole step row
        const stepRow = button.parentElement;

        // Remove it
        stepRow.remove();

        // Fix numbering
        renumberSteps(ingredientIndex);
    }

    function renumberSteps(ingredientIndex) {

        const container =
            document.getElementById(`steps-${ingredientIndex}`);

        const rows =
            container.querySelectorAll(".step-row");

        rows.forEach((row, index) => {

            const label = row.querySelector("label");

            label.textContent =
                `Preparation Step ${index + 1}:`;
        });
    }