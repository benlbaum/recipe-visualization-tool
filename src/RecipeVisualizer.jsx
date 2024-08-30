import React, { useState, useCallback, useRef } from 'react';
import ReactFlow, { 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState,
  addEdge,
  Handle,
  Position,
  getBezierPath,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { TextField, Button, Box, Menu, MenuItem } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';

const COLUMN_WIDTH = 300; // X-Axis Snapping
const ROW_HEIGHT = 100; // Y-Axis Snapping
const NODE_WIDTH = 200;

const getNearestColumn = (x) => Math.round(x / COLUMN_WIDTH) * COLUMN_WIDTH; // X-Axis Snapping
const getNearestRow = (y) => Math.round(y / ROW_HEIGHT) * ROW_HEIGHT; // Y-Axis Snapping

const nodeStyle = {
  width: `${NODE_WIDTH}px`,
  padding: '10px',
  border: '1px solid #ddd',
  borderRadius: '5px',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  minHeight: '50px',
  position: 'relative',
  color: '#333',
  fontWeight: 'bold',
};

const CustomNode = ({ id, data, type }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedLabel, setEditedLabel] = useState(data.label);
    const [contextMenu, setContextMenu] = useState(null);
  
    const handleContextMenu = (event) => {
      event.preventDefault();
      event.stopPropagation();
      setContextMenu(
        contextMenu === null
          ? { mouseX: event.clientX - 2, mouseY: event.clientY - 4 }
          : null,
      );
    };
  
    const handleClose = () => {
      setContextMenu(null);
    };
  
    const startEditing = () => {
      setIsEditing(true);
      setEditedLabel(data.label);
      handleClose();
    };
  
    const handleBlur = () => {
      setIsEditing(false);
      if (editedLabel !== data.label) {
        data.onEdit(id, editedLabel);
      }
    };
  
    const handleChange = (event) => {
      setEditedLabel(event.target.value);
    };
  
    const NodeContent = () => {
      if (isEditing) {
        return (
          <input
            type="text"
            value={editedLabel}
            onChange={handleChange}
            onBlur={handleBlur}
            autoFocus
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              textAlign: 'center',
              color: 'inherit',
              fontWeight: 'inherit',
            }}
          />
        );
      }
  
      return (
        <>
          {data.label}
          {type === 'ingredient' && <Handle type="source" position={Position.Right} />}
          {type === 'step' && (
            <>
              <Handle type="target" position={Position.Left} />
              <Handle type="source" position={Position.Right} />
            </>
          )}
          {type === 'finalDish' && <Handle type="target" position={Position.Left} />}
        </>
      );
    };
  
    return (
      <div 
        style={{ ...nodeStyle, background: data.background }} 
        onContextMenu={handleContextMenu}
      >
        <NodeContent />
        <Menu
          open={contextMenu !== null}
          onClose={handleClose}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
              : undefined
          }
        >
          <MenuItem onClick={startEditing}>
            <EditIcon fontSize="small" style={{ marginRight: '8px' }} />
            Edit
          </MenuItem>
          <MenuItem onClick={() => { data.onDelete(id); handleClose(); }}>
            <DeleteIcon fontSize="small" style={{ marginRight: '8px' }} />
            Delete
          </MenuItem>
        </Menu>
      </div>
    );
  };

const nodeTypes = {
  ingredient: CustomNode,
  step: CustomNode,
  finalDish: CustomNode,
};

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) => {
    const [edgePath] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
    });

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={edgePath}
    />
  );
};

const edgeTypes = {
  custom: CustomEdge,
};

const RecipeVisualizer = () => {
  const [ingredients, setIngredients] = useState([]);
  const [steps, setSteps] = useState([]);
  const [finalDish, setFinalDish] = useState(null);
  const [newIngredient, setNewIngredient] = useState('');
  const [newStep, setNewStep] = useState({ description: '', time: 0 });
  const [newFinalDish, setNewFinalDish] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const fileInputRef = useRef(null);

  const importDemoRecipe = () => {
    const demoRecipe = {
      "nodes": [
        {
          "id": "ing-1724614386913",
          "type": "ingredient",
          "data": {
            "label": "2 Tbsp Unsalted Butter",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": -125.5
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 2,
            "y": -125.5
          },
          "dragging": false
        },
        {
          "id": "ing-1724614396851",
          "type": "ingredient",
          "data": {
            "label": "3 Tbsp AP Flour",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": -10.368796104188363
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": -10.368796104188363
          },
          "dragging": false
        },
        {
          "id": "ing-1724614407389",
          "type": "ingredient",
          "data": {
            "label": "3/4 Cup Whole Milk",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 97.531551867813
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 1.515716566510406,
            "y": 97.531551867813
          },
          "dragging": false
        },
        {
          "id": "ing-1724614444476",
          "type": "ingredient",
          "data": {
            "label": "2/3 Cup Beer",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 220.9385394307286
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": -1.7411011265922554,
            "y": 220.9385394307286
          },
          "dragging": false
        },
        {
          "id": "ing-1724614453468",
          "type": "ingredient",
          "data": {
            "label": "1 Tsp Worcestershire Sauce",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 296.30422478502953
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": -1.7411011265922411,
            "y": 296.30422478502953
          },
          "dragging": false
        },
        {
          "id": "ing-1724614462309",
          "type": "ingredient",
          "data": {
            "label": "1 Tsp Dijon Mustard",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 374.6343146456993
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": 374.6343146456993
          },
          "dragging": false
        },
        {
          "id": "ing-1724614475862",
          "type": "ingredient",
          "data": {
            "label": "1/2 Tsp Garlic Powder",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 450.96440450636896
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": 450.96440450636896
          },
          "dragging": false
        },
        {
          "id": "ing-1724614488095",
          "type": "ingredient",
          "data": {
            "label": "1/4 Tsp Smoked Paprika",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 530.7766966202231
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": 530.7766966202231
          },
          "dragging": false
        },
        {
          "id": "ing-1724614495482",
          "type": "ingredient",
          "data": {
            "label": "1/4 Tsp Salt",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 609.106786480893
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": 609.106786480893
          },
          "dragging": false
        },
        {
          "id": "ing-1724614513415",
          "type": "ingredient",
          "data": {
            "label": "2.5 Cups Shredded Sharp Cheddar Cheese",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": -259.9999999999999
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 0,
            "y": -259.9999999999999
          },
          "dragging": false
        },
        {
          "id": "step-1724614546393",
          "type": "step",
          "data": {
            "label": "Shred Cheese (1 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": -259.6
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 288,
            "y": -259.6
          },
          "dragging": false
        },
        {
          "id": "step-1724614592526",
          "type": "step",
          "data": {
            "label": "Melt in Medium Saucepan over Medium Heat (1 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": -126
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 292,
            "y": -126
          },
          "dragging": false
        },
        {
          "id": "step-1724614632588",
          "type": "step",
          "data": {
            "label": "Whisk Together Until Slightly Thickened (2 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 600,
            "y": -30
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 600,
            "y": -30
          },
          "dragging": false
        },
        {
          "id": "step-1724614696931",
          "type": "step",
          "data": {
            "label": "Whisk In as a Slow and Steady Stream (3 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 900,
            "y": 63.98694340367746
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 898,
            "y": 63.98694340367746
          },
          "dragging": false
        },
        {
          "id": "step-1724614856182",
          "type": "step",
          "data": {
            "label": "Whisk In One at A Time (4 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 1200,
            "y": 160
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 1196,
            "y": 160
          },
          "dragging": false
        },
        {
          "id": "step-1724615009608",
          "type": "step",
          "data": {
            "label": "Slowing Fold In Until Fully Incorporated (5 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 1500,
            "y": 72.00000000000006
          },
          "width": 222,
          "height": 72,
          "selected": false,
          "positionAbsolute": {
            "x": 1528.8000000000009,
            "y": 72.00000000000006
          },
          "dragging": false
        },
        {
          "id": "final-dish",
          "type": "finalDish",
          "data": {
            "label": "Beer Cheese Dip",
            "background": "#90EE90"
          },
          "position": {
            "x": 1800,
            "y": 72
          },
          "width": 222,
          "height": 72,
          "selected": true,
          "positionAbsolute": {
            "x": 1800,
            "y": 72
          },
          "dragging": false
        }
      ],
      "edges": [
        {
          "source": "ing-1724614513415",
          "sourceHandle": null,
          "target": "step-1724614546393",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614513415-step-1724614546393"
        },
        {
          "source": "ing-1724614386913",
          "sourceHandle": null,
          "target": "step-1724614592526",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614386913-step-1724614592526"
        },
        {
          "source": "ing-1724614396851",
          "sourceHandle": null,
          "target": "step-1724614632588",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614396851-step-1724614632588"
        },
        {
          "source": "step-1724614592526",
          "sourceHandle": null,
          "target": "step-1724614632588",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724614592526-step-1724614632588"
        },
        {
          "source": "step-1724614632588",
          "sourceHandle": null,
          "target": "step-1724614696931",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724614632588-step-1724614696931"
        },
        {
          "source": "ing-1724614407389",
          "sourceHandle": null,
          "target": "step-1724614696931",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614407389-step-1724614696931"
        },
        {
          "source": "ing-1724614444476",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614444476-step-1724614856182"
        },
        {
          "source": "ing-1724614453468",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614453468-step-1724614856182"
        },
        {
          "source": "ing-1724614462309",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614462309-step-1724614856182"
        },
        {
          "source": "ing-1724614475862",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614475862-step-1724614856182"
        },
        {
          "source": "ing-1724614488095",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614488095-step-1724614856182"
        },
        {
          "source": "ing-1724614495482",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-ing-1724614495482-step-1724614856182"
        },
        {
          "source": "step-1724614546393",
          "sourceHandle": null,
          "target": "step-1724615009608",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724614546393-step-1724615009608"
        },
        {
          "source": "step-1724614856182",
          "sourceHandle": null,
          "target": "step-1724615009608",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724614856182-step-1724615009608"
        },
        {
          "source": "step-1724614696931",
          "sourceHandle": null,
          "target": "step-1724614856182",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724614696931-step-1724614856182"
        },
        {
          "source": "step-1724615009608",
          "sourceHandle": null,
          "target": "final-dish",
          "targetHandle": null,
          "type": "custom",
          "data": {},
          "id": "reactflow__edge-step-1724615009608-final-dish"
        }
      ],
      "ingredients": [
        {
          "id": "ing-1724614386913",
          "type": "ingredient",
          "data": {
            "label": "2 Tbsp Unsalted Butter",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 0
          }
        },
        {
          "id": "ing-1724614396851",
          "type": "ingredient",
          "data": {
            "label": "3 Tbsp AP Flour",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 100
          }
        },
        {
          "id": "ing-1724614407389",
          "type": "ingredient",
          "data": {
            "label": "3/4 Cup Whole Milk",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 200
          }
        },
        {
          "id": "ing-1724614444476",
          "type": "ingredient",
          "data": {
            "label": "2/3 Cup Beer",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 300
          }
        },
        {
          "id": "ing-1724614453468",
          "type": "ingredient",
          "data": {
            "label": "1 Tsp Worcestershire Sauce",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 400
          }
        },
        {
          "id": "ing-1724614462309",
          "type": "ingredient",
          "data": {
            "label": "1 Tsp Dijon Mustard",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 500
          }
        },
        {
          "id": "ing-1724614475862",
          "type": "ingredient",
          "data": {
            "label": "1/2 Tsp Garlic Powder",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 600
          }
        },
        {
          "id": "ing-1724614488095",
          "type": "ingredient",
          "data": {
            "label": "1/4 Tsp Smoked Paprika",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 700
          }
        },
        {
          "id": "ing-1724614495482",
          "type": "ingredient",
          "data": {
            "label": "1/4 Tsp Salt",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 800
          }
        },
        {
          "id": "ing-1724614513415",
          "type": "ingredient",
          "data": {
            "label": "2.5 Cups Shredded Sharp Cheddar Cheese",
            "background": "#F0E68C"
          },
          "position": {
            "x": 0,
            "y": 900
          }
        }
      ],
      "steps": [
        {
          "id": "step-1724614546393",
          "type": "step",
          "data": {
            "label": "Shred Cheese (1 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 0
          }
        },
        {
          "id": "step-1724614592526",
          "type": "step",
          "data": {
            "label": "Melt in Medium Saucepan over Medium Heat (1 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 100
          }
        },
        {
          "id": "step-1724614632588",
          "type": "step",
          "data": {
            "label": "Whisk Together Until Slightly Thickened (2 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 200
          }
        },
        {
          "id": "step-1724614696931",
          "type": "step",
          "data": {
            "label": "Whisk In as a Slow and Steady Stream (3 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 300
          }
        },
        {
          "id": "step-1724614856182",
          "type": "step",
          "data": {
            "label": "Whisk In One at A Time (4 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 400
          }
        },
        {
          "id": "step-1724615009608",
          "type": "step",
          "data": {
            "label": "Slowing Fold In Until Fully Incorporated (5 min)",
            "background": "#ADD8E6"
          },
          "position": {
            "x": 300,
            "y": 500
          }
        }
      ]
    };

    setNodes(demoRecipe.nodes);
    setEdges(demoRecipe.edges);
    setIngredients(demoRecipe.nodes.filter(node => node.type === 'ingredient'));
    setSteps(demoRecipe.nodes.filter(node => node.type === 'step'));
    setFinalDish(demoRecipe.nodes.find(node => node.type === 'finalDish'));
  };

  const onConnect = useCallback((params) => {
    setEdges((eds) => addEdge({ ...params, type: 'custom', data: { onDelete: deleteEdge } }, eds));
  }, [setEdges]);

  const deleteEdge = useCallback((edgeId) => {
    setEdges((eds) => eds.filter((edge) => edge.id !== edgeId));
  }, [setEdges]);

  const onEditNode = useCallback((nodeId, newLabel) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId
          ? { ...node, data: { ...node.data, label: newLabel } }
          : node
      )
    );
  }, [setNodes]);

  const onDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  const getNodeData = useCallback((type, label) => {
    return {
      label,
      onEdit: onEditNode,
      onDelete: onDeleteNode,
      background: type === 'ingredient' ? '#F0E68C' : type === 'step' ? '#ADD8E6' : '#90EE90',
    };
  }, [onEditNode, onDeleteNode]);

  const addIngredient = () => {
    if (newIngredient) {
      const newNode = {
        id: `ing-${Date.now()}`,
        type: 'ingredient',
        data: getNodeData('ingredient', newIngredient),
        position: { x: 0, y: getNearestRow(ingredients.length * ROW_HEIGHT) },
      };
      setNodes((nds) => [...nds, newNode]);
      setIngredients([...ingredients, newNode]);
      setNewIngredient('');
    }
  };

  const addStep = () => {
    if (newStep.description && newStep.time) {
      const newNode = {
        id: `step-${Date.now()}`,
        type: 'step',
        data: getNodeData('step', `${newStep.description} (${newStep.time} min)`),
        position: { x: COLUMN_WIDTH, y: getNearestRow(steps.length * ROW_HEIGHT) },
      };
      setNodes((nds) => [...nds, newNode]);
      setSteps([...steps, newNode]);
      setNewStep({ description: '', time: 0 });
    }
  };

  const addFinalDish = () => {
    if (newFinalDish) {
      const newNode = {
        id: 'final-dish',
        type: 'finalDish',
        data: getNodeData('finalDish', newFinalDish),
        position: { x: COLUMN_WIDTH * 2, y: 0 },
      };
      setNodes((nds) => [...nds, newNode]);
      setFinalDish(newNode);
      setNewFinalDish('');
    }
  };

  //Axis Snapping
  const onNodeDragStop = (event, node) => { 
    const newX = getNearestColumn(node.position.x); // X-Axis Snapping
    const newY = getNearestRow(node.position.y); // Y-Axis Snapping
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === node.id) {
          return { ...n, position: { ...n.position, x: newX, y: newY } };
        }
        return n;
      })
    );
  };

  const exportRecipe = () => {
    const recipeData = {
      nodes,
      edges,
      ingredients,
      steps,
      finalDish
    };
    const dataStr = JSON.stringify(recipeData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'recipe.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importRecipe = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const recipeData = JSON.parse(e.target.result);
          setNodes(recipeData.nodes || []);
          setEdges(recipeData.edges || []);
          setIngredients(recipeData.ingredients || []);
          setSteps(recipeData.steps || []);
          setFinalDish(recipeData.finalDish || null);
        } catch (error) {
          console.error('Error parsing imported file:', error);
          alert('Failed to import recipe. Please check the file format.');
        }
      };

      reader.readAsText(file);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', gap: 2, p: 2, flexWrap: 'wrap' }}>
        <TextField 
          value={newIngredient}
          onChange={(e) => setNewIngredient(e.target.value)}
          label="Add Ingredient"
        />
        <Button onClick={addIngredient} variant="contained">Add Ingredient</Button>
        
        <TextField 
          value={newStep.description}
          onChange={(e) => setNewStep({...newStep, description: e.target.value})}
          label="Step Description"
        />
        <TextField 
          type="number"
          value={newStep.time}
          onChange={(e) => setNewStep({...newStep, time: parseInt(e.target.value)})}
          label="Time (minutes)"
        />
        <Button onClick={addStep} variant="contained">Add Step</Button>
        
        <TextField 
          value={newFinalDish}
          onChange={(e) => setNewFinalDish(e.target.value)}
          label="Final Dish Name"
        />
        <Button onClick={addFinalDish} variant="contained" disabled={finalDish !== null}>
          Add Final Dish
        </Button>
        
        <Button 
          onClick={exportRecipe} 
          variant="contained" 
          startIcon={<SaveIcon />}
        >
          Export Recipe
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={importRecipe}
          accept=".json"
        />
        <Button 
          onClick={() => fileInputRef.current.click()} 
          variant="contained" 
          startIcon={<UploadIcon />}
        >
          Import Recipe
        </Button>

        <Button 
          onClick={importDemoRecipe} 
          variant="contained" 
          color="secondary"
        >
          Import Demo Recipe
        </Button>
      </Box>
      
      <Box sx={{ flexGrow: 1, width: '100%' }}>
        <ReactFlow 
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.1}  // Allow zooming out to 10% of the original size
          maxZoom={4}    // Allow zooming in to 400% of the original size
          defaultZoom={1} // Start at 100% zoom
        >
          <Background />
          <Controls
            showZoom={true}
            showFitView={true}
            showInteractive={false}
          />
        </ReactFlow>
      </Box>
    </Box>
  );
};

export default RecipeVisualizer;